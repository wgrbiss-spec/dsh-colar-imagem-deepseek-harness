/**
 * COLAR IMAGEM DEEPSEEK HARNESS — metade host (Node).
 *
 * Serve a metade client (o bundle do navegador) com tudo que o navegador não
 * consegue fazer sozinho no app Desktop:
 *
 *  - `GET  /colar-imagem-deepseek-harness/config`    configuração padrão do pacote
 *  - `GET  /colar-imagem-deepseek-harness/clipboard` sonda a área de transferência
 *  - `POST /colar-imagem-deepseek-harness/read`      lê a área de transferência,
 *                                                    grava a cópia no workspace e
 *                                                    devolve os bytes (base64)
 *  - `POST /colar-imagem-deepseek-harness/save`      grava bytes que o navegador
 *                                                    já tem (Ctrl+V nativo)
 *
 * Regras de ouro:
 *  - Nada sai da máquina: os bytes só atravessam a rota local do Harness.
 *  - Nenhuma rota aceita requisição que não venha da página do próprio app
 *    (loopback + `Sec-Fetch-Site`/`Origin` iguais ao Host).
 *  - Toda gravação fica contida no workspace da sessão.
 */

import {
  CLIPBOARD_CODES,
  createRunner,
  normalizeMediaType,
  probeClipboard,
  readClipboard,
} from './clipboard.js'
import {
  buildFileName,
  destinationDir,
  displayRelativePath,
  normalizePastedDir,
  requireDirectory,
  sanitizeSegment,
  workspacePathForSession,
  writeUniqueFile,
} from './save.js'

/** Nome do plugin (id do Loader e prefixo de rotas). */
export const name = 'colar-imagem-deepseek-harness'

/** Prefixo HTTP servido ao navegador. */
export const ROUTE_PREFIX = '/colar-imagem-deepseek-harness'

/** Caminho de cada rota. */
export const ROUTES = {
  config: `${ROUTE_PREFIX}/config`,
  clipboard: `${ROUTE_PREFIX}/clipboard`,
  read: `${ROUTE_PREFIX}/read`,
  save: `${ROUTE_PREFIX}/save`,
}

/** Configuração padrão; qualquer campo pode ser sobrescrito no patch do perfil. */
export const DEFAULT_CONFIG = {
  /** Pasta relativa ao workspace onde as cópias são guardadas. */
  pastedDir: 'pasted-images',
  /** Separar as cópias em subpastas AAAA-MM-DD. */
  dateFolders: true,
  /** Salvar também as imagens coladas com Ctrl+V (além do botão direito). */
  saveNativePastes: false,
  /** Padrão da opção “guardar cópia no workspace” (desligada por padrão). */
  saveWorkspaceCopies: false,
  /** Limite de bytes de uma imagem lida da área de transferência. */
  maxClipboardBytes: 50 * 1024 * 1024,
  /** Orçamento da leitura da área de transferência (cada ferramenta do sistema). */
  clipboardTimeoutMs: 5000,
}

/** Tipos MIME de imagem aceitos na rota de gravação de bytes. */
const SAVE_MEDIA_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
])

/** Formato esperado de um id de sessão do Harness. */
const SESSION_ID_PATTERN = /^session-[A-Za-z0-9-]{1,120}$/

/** Mensagem curta e legível de qualquer erro. */
function messageOf(error) {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Normaliza a configuração do patch do perfil.
 * @param {Record<string, unknown>} [config] configuração crua.
 * @returns {typeof DEFAULT_CONFIG} configuração efetiva.
 */
export function resolveConfig(config = {}) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  const maxClipboardBytes = Number(raw.maxClipboardBytes)
  const clipboardTimeoutMs = Number(raw.clipboardTimeoutMs)
  return {
    pastedDir: normalizePastedDir(raw.pastedDir ?? DEFAULT_CONFIG.pastedDir),
    dateFolders: raw.dateFolders === undefined ? DEFAULT_CONFIG.dateFolders : raw.dateFolders !== false,
    saveNativePastes: raw.saveNativePastes === undefined ? DEFAULT_CONFIG.saveNativePastes : raw.saveNativePastes === true,
    saveWorkspaceCopies: raw.saveWorkspaceCopies === undefined ? DEFAULT_CONFIG.saveWorkspaceCopies : raw.saveWorkspaceCopies === true,
    maxClipboardBytes: Number.isFinite(maxClipboardBytes) && maxClipboardBytes > 0
      ? Math.min(maxClipboardBytes, 512 * 1024 * 1024)
      : DEFAULT_CONFIG.maxClipboardBytes,
    clipboardTimeoutMs: Number.isFinite(clipboardTimeoutMs) && clipboardTimeoutMs > 0
      ? Math.min(clipboardTimeoutMs, 30_000)
      : DEFAULT_CONFIG.clipboardTimeoutMs,
  }
}

/**
 * True para localhost / [::1] / 127.x.x.x (semântica de `isTrustedApiRequest`).
 * @param {string} hostname hostname do Host.
 * @returns {boolean} se é loopback.
 */
export function isLoopbackHostname(hostname) {
  if (hostname === 'localhost' || hostname === '[::1]' || hostname === '::1') return true
  const parts = hostname.split('.')
  return parts.length === 4
    && parts[0] === '127'
    && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

/**
 * Cerca de confiança da página: só o próprio app (loopback, mesma origem) entra.
 * @param {import('node:http').IncomingMessage} req requisição.
 * @returns {boolean} se a requisição é confiável.
 */
export function isTrustedRequest(req) {
  const host = req.headers.host
  if (typeof host !== 'string' || host === '') return false
  let hostUrl
  try {
    hostUrl = new URL(`http://${host}`)
  } catch {
    return false
  }
  if (!isLoopbackHostname(hostUrl.hostname)) return false
  const site = req.headers['sec-fetch-site']
  if (typeof site === 'string' && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.origin
  if (typeof origin === 'string' && origin !== '') {
    let originUrl
    try {
      originUrl = new URL(origin)
    } catch {
      return false
    }
    if (originUrl.host !== host) return false
  }
  return true
}

/**
 * Cabeçalhos JSON sem cache.
 * @param {import('node:http').ServerResponse} res resposta.
 * @param {number} statusCode status HTTP.
 * @param {unknown} payload corpo serializável.
 */
export function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload)
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
  })
  res.end(body)
}

/**
 * Lê o corpo inteiro de uma requisição respeitando um limite.
 * @param {import('node:http').IncomingMessage} req requisição.
 * @param {number} limitBytes limite máximo.
 * @returns {Promise<Buffer>} bytes do corpo.
 */
export async function readBody(req, limitBytes) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += bytes.length
    if (total > limitBytes) {
      const error = new Error(`corpo maior que o limite de ${limitBytes} bytes`)
      error.code = 'body-too-large'
      throw error
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

/**
 * Valida o id de sessão usado para resolver o workspace.
 * @param {unknown} value valor cru (query/header).
 * @returns {string | null} sessão válida ou null.
 */
export function parseSessionId(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return SESSION_ID_PATTERN.test(trimmed) ? trimmed : null
}

/**
 * Resolve o diretório do workspace da sessão e valida que existe.
 * @param {object} ctx contexto do plugin.
 * @param {string} sessionId sessão de origem.
 * @returns {Promise<string | null>} diretório real ou null quando desconhecido.
 */
export async function resolveWorkspace(ctx, sessionId) {
  const registry = typeof ctx?.get === 'function' ? ctx.get('workspaceRegistry') ?? ctx?.workspaceRegistry : ctx?.workspaceRegistry
  const path = workspacePathForSession(registry, sessionId)
  if (path === null) return null
  try {
    return await requireDirectory(path)
  } catch {
    return null
  }
}

/**
 * Grava uma imagem no workspace e devolve os metadados de exibição.
 * @param {object} options opções.
 * @param {string} options.workspacePath diretório do workspace.
 * @param {Buffer} options.bytes bytes da imagem.
 * @param {string} options.mediaType tipo MIME.
 * @param {string} [options.fileName] nome sugerido.
 * @param {typeof DEFAULT_CONFIG} options.config configuração efetiva.
 * @param {Date} [options.now] instante da colagem.
 * @returns {Promise<{ path: string, relativePath: string, name: string, bytes: number }>} resultado.
 */
export async function saveImageCopy({ workspacePath, bytes, mediaType, fileName, config, now = new Date() }) {
  const type = normalizeMediaType(mediaType)
  const directory = destinationDir(workspacePath, config.pastedDir, now, config.dateFolders)
  const suggested = typeof fileName === 'string' && fileName.trim().length > 0
    ? sanitizeSegment(fileName.trim(), 'imagem')
    : buildFileName({ mediaType: type, now })
  const withExtension = /\.[A-Za-z0-9]{1,5}$/.test(suggested)
    ? suggested
    : `${suggested}.${type === 'image/jpeg' ? 'jpg' : (type.split('/')[1] ?? 'png')}`
  const written = await writeUniqueFile({ directory, fileName: withExtension, bytes })
  return {
    path: written.path,
    relativePath: displayRelativePath(workspacePath, written.path),
    name: written.name,
    bytes: written.bytes,
  }
}

/**
 * Monta a metade host.
 * @param {import('@deepseek-ai/cordis').Context} ctx contexto do plugin.
 * @param {Partial<typeof DEFAULT_CONFIG>} [config] configuração do patch.
 */
export function apply(ctx, config = {}) {
  const options = resolveConfig(config)
  const run = createRunner({ timeoutMs: options.clipboardTimeoutMs, maxBufferBytes: options.maxClipboardBytes + 4 * 1024 * 1024 })
  const log = (level, message) => {
    try {
      if (typeof ctx?.logger?.[level] === 'function') ctx.logger[level](`[${name}] ${message}`)
    } catch { /* logger é opcional */ }
  }

  /**
   * Resolve a sessão e grava a cópia. Retorna `saved`/`saveError` sem derrubar
   * a colagem quando o workspace ainda não é conhecido.
   * @param {string} sessionId sessão de origem.
   * @param {Buffer} bytes bytes da imagem.
   * @param {string} mediaType tipo MIME.
   * @param {string} [fileName] nome sugerido.
   * @returns {Promise<{ saved: boolean, saveError: string | null, path?: string, relativePath?: string, name?: string }>} resultado.
   */
  async function trySaveCopy(sessionId, bytes, mediaType, fileName) {
    try {
      const workspacePath = await resolveWorkspace(ctx, sessionId)
      if (workspacePath === null) {
        return { saved: false, saveError: 'workspace-unknown' }
      }
      const saved = await saveImageCopy({ workspacePath, bytes, mediaType, fileName, config: options })
      return { saved: true, saveError: null, ...saved }
    } catch (error) {
      log('warn', `falha ao gravar cópia no workspace: ${messageOf(error)}`)
      return { saved: false, saveError: messageOf(error) }
    }
  }

  /** Handler de todas as rotas: confiança, método, sessão e erros comuns. */
  function guarded(handler) {
    return async (req, res) => {
      if (!isTrustedRequest(req)) {
        sendJson(res, 403, { ok: false, code: 'untrusted', error: 'requisição fora da página do app' })
        return
      }
      try {
        await handler(req, res)
      } catch (error) {
        const code = typeof error?.code === 'string' ? error.code : 'internal'
        const status = code === 'body-too-large' ? 413 : 500
        log('warn', `rota falhou (${code}): ${messageOf(error)}`)
        sendJson(res, status, { ok: false, code, error: messageOf(error) })
      }
    }
  }

  /** Sessão da query string ou do cabeçalho `x-dsh-session-id`. */
  function sessionOf(req, url) {
    const fromQuery = parseSessionId(url.searchParams.get('sessionId'))
    if (fromQuery !== null) return fromQuery
    const header = req.headers['x-dsh-session-id']
    return parseSessionId(Array.isArray(header) ? header[0] : header)
  }

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: ROUTES.config,
      handler: guarded(async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendJson(res, 405, { ok: false, error: 'método não permitido' })
          return
        }
        sendJson(res, 200, {
          ok: true,
          version: '0.1.1',
          defaults: {
            pastedDir: options.pastedDir,
            dateFolders: options.dateFolders,
            saveWorkspaceCopies: options.saveWorkspaceCopies,
            saveNativePastes: options.saveNativePastes,
            maxClipboardBytes: options.maxClipboardBytes,
          },
        })
      }),
    }), `${name}: config route`)

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: ROUTES.clipboard,
      handler: guarded(async (req, res) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          sendJson(res, 405, { ok: false, error: 'método não permitido' })
          return
        }
        const probe = await probeClipboard({ run })
        sendJson(res, 200, { ok: probe.kind !== 'unsupported', ...probe })
      }),
    }), `${name}: clipboard probe route`)

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: ROUTES.read,
      handler: guarded(async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'método não permitido' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const sessionId = sessionOf(req, url)
        const saveCopy = url.searchParams.get('save') !== '0'
        const read = await readClipboard({ run, maxBytes: options.maxClipboardBytes })
        if (read.kind === 'image') {
          const mediaType = normalizeMediaType(read.mediaType)
          if (!SAVE_MEDIA_TYPES.has(mediaType)) {
            sendJson(res, 200, { ok: false, code: 'unsupported-media-type', error: `tipo de imagem não suportado: ${mediaType}`, mediaType })
            return
          }
          const fileName = buildFileName({ mediaType })
          const copy = sessionId === null || saveCopy !== true
            ? { saved: false, saveError: sessionId === null ? 'session-unknown' : 'disabled' }
            : await trySaveCopy(sessionId, read.bytes, mediaType, fileName)
          sendJson(res, 200, {
            ok: true,
            kind: 'image',
            mediaType,
            name: copy.name ?? fileName,
            bytes: read.bytes.length,
            base64: read.bytes.toString('base64'),
            tool: read.tool ?? null,
            ...copy,
          })
          return
        }
        if (read.kind === 'text') {
          const text = typeof read.text === 'string' ? read.text.slice(0, 512 * 1024) : ''
          sendJson(res, 200, { ok: true, kind: 'text', text, tool: read.tool ?? null })
          return
        }
        if (read.kind === 'empty') {
          sendJson(res, 200, { ok: true, kind: 'empty', tool: read.tool ?? null })
          return
        }
        sendJson(res, 200, {
          ok: false,
          kind: 'unsupported',
          code: read.code ?? CLIPBOARD_CODES.unsupported,
          error: read.error ?? 'área de transferência indisponível',
        })
      }),
    }), `${name}: clipboard read route`)

    webCtx.effect(() => webCtx.webServer.register({
      kind: 'exact',
      path: ROUTES.save,
      handler: guarded(async (req, res) => {
        if (req.method !== 'POST') {
          sendJson(res, 405, { ok: false, error: 'método não permitido' })
          return
        }
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        const sessionId = sessionOf(req, url)
        if (sessionId === null) {
          sendJson(res, 400, { ok: false, code: 'session-unknown', error: 'sessão ausente' })
          return
        }
        const mediaType = normalizeMediaType(req.headers['x-media-type'])
        if (!SAVE_MEDIA_TYPES.has(mediaType)) {
          sendJson(res, 415, { ok: false, code: 'unsupported-media-type', error: `tipo de imagem não suportado: ${mediaType}` })
          return
        }
        const bytes = await readBody(req, options.maxClipboardBytes)
        if (bytes.length === 0) {
          sendJson(res, 400, { ok: false, code: 'empty-body', error: 'corpo vazio' })
          return
        }
        const headerName = req.headers['x-file-name']
        let suggestedName = typeof headerName === 'string' && headerName.length > 0
          ? decodeURIComponent(headerName)
          : buildFileName({ mediaType })
        const copy = await trySaveCopy(sessionId, bytes, mediaType, suggestedName)
        if (!copy.saved) {
          const missingWorkspace = copy.saveError === 'workspace-unknown'
          sendJson(res, missingWorkspace ? 409 : 500, {
            ok: false,
            code: missingWorkspace ? 'workspace-unknown' : 'save-failed',
            error: missingWorkspace ? 'workspace da sessão ainda não está registrado' : String(copy.saveError),
          })
          return
        }
        sendJson(res, 200, { ok: true, ...copy })
      }),
    }), `${name}: save bytes route`)
  })

  log('info', 'rotas de colagem registradas')
}
