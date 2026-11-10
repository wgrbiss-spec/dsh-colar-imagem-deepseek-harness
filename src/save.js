/**
 * Gravação das cópias de imagens coladas dentro do workspace.
 *
 * Layout: `<cwd-do-workspace>/<pastedDir>/<AAAA-MM-DD>/<nome>.png`.
 * Nenhum caminho sai do workspace: o diretório base é resolvido a partir da
 * sessão e nomes/segmentos são higienizados antes de qualquer escrita.
 */

import { mkdir, open, realpath, stat, unlink } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'

import { extensionForMediaType } from './clipboard.js'

/** Data local no formato AAAA-MM-DD. */
export function dateFolder(now = new Date()) {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Hora local no formato HH-MM-SS (para nomes de arquivo). */
export function timeStamp(now = new Date()) {
  const hours = String(now.getHours()).padStart(2, '0')
  const minutes = String(now.getMinutes()).padStart(2, '0')
  const seconds = String(now.getSeconds()).padStart(2, '0')
  return `${hours}-${minutes}-${seconds}`
}

/**
 * Higieniza um segmento de nome de arquivo.
 * @param {unknown} value nome bruto.
 * @param {string} fallback nome padrão quando nada útil sobra.
 * @returns {string} nome seguro.
 */
export function sanitizeSegment(value, fallback = 'imagem') {
  const raw = typeof value === 'string' ? value : ''
  const cleaned = raw
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim()
  const limited = cleaned.slice(0, 120)
  return limited.length > 0 ? limited : fallback
}

/**
 * Valida e normaliza a pasta relativa configurada (`pastedDir`).
 * @param {unknown} value valor da configuração.
 * @returns {string} caminho relativo seguro (vazio vira `pasted-images`).
 */
export function normalizePastedDir(value) {
  const raw = typeof value === 'string' ? value.trim() : ''
  if (raw.length === 0) return 'pasted-images'
  if (isAbsolute(raw) || /^[A-Za-z]:[\\/]/.test(raw)) return 'pasted-images'
  const segments = raw.split(/[\\/]+/).filter((segment) => segment.length > 0 && segment !== '.')
  if (segments.length === 0 || segments.includes('..')) return 'pasted-images'
  return segments.map((segment) => sanitizeSegment(segment, 'pasted-images')).join('/')
}

/**
 * Nome de arquivo determinístico para uma imagem colada.
 * @param {object} options opções.
 * @param {string} options.mediaType tipo MIME.
 * @param {Date} [options.now] instante da colagem.
 * @param {number} [options.sequence] desambiguador (0 = sem sufixo).
 * @returns {string} nome do arquivo com extensão.
 */
export function buildFileName({ mediaType, now = new Date(), sequence = 0 }) {
  const extension = extensionForMediaType(mediaType)
  const base = `colada-${dateFolder(now)}-${timeStamp(now)}`
  return `${base}${sequence > 0 ? `-${sequence + 1}` : ''}.${extension}`
}

/**
 * Monta o diretório de destino dentro do workspace, garantindo contenção.
 * @param {string} workspacePath diretório do workspace.
 * @param {string} pastedDir pasta relativa configurada.
 * @param {Date} now instante da colagem.
 * @param {boolean} dateFolders separar por data.
 * @returns {string} caminho absoluto do diretório de destino.
 */
export function destinationDir(workspacePath, pastedDir, now = new Date(), dateFolders = true) {
  const root = resolve(workspacePath)
  const safeRelative = normalizePastedDir(pastedDir)
  const target = dateFolders ? join(root, safeRelative, dateFolder(now)) : join(root, safeRelative)
  const relativeToRoot = relative(root, target)
  if (relativeToRoot.startsWith('..') || isAbsolute(relativeToRoot)) {
    throw new Error('destino fora do workspace')
  }
  return target
}

/**
 * Descobre o diretório do workspace de uma sessão.
 * @param {unknown} registry serviço `workspaceRegistry` (ou null).
 * @param {string} sessionId sessão de origem.
 * @returns {string | null} caminho do workspace ou null quando desconhecido.
 */
export function workspacePathForSession(registry, sessionId) {
  if (registry === null || registry === undefined || typeof registry.list !== 'function') return null
  if (typeof sessionId !== 'string' || sessionId.length === 0) return null
  let workspaces = []
  try {
    workspaces = registry.list()
  } catch {
    return null
  }
  if (!Array.isArray(workspaces)) return null
  for (const workspace of workspaces) {
    if (workspace === null || typeof workspace !== 'object') continue
    const ids = workspace.sessionIds
    if (Array.isArray(ids) && ids.includes(sessionId) && typeof workspace.path === 'string') {
      return workspace.path
    }
  }
  return null
}

/**
 * Verifica que o caminho é um diretório existente (e o devolve canonicalizado).
 * @param {string} path caminho candidato.
 * @returns {Promise<string>} caminho real.
 */
export async function requireDirectory(path) {
  const real = await realpath(path)
  const info = await stat(real)
  if (!info.isDirectory()) throw new Error(`não é um diretório: ${path}`)
  return real
}

/**
 * Grava bytes num arquivo novo, com sufixo numérico em caso de colisão.
 * @param {object} options opções.
 * @param {string} options.directory diretório de destino (já validado).
 * @param {string} options.fileName nome desejado.
 * @param {Buffer} options.bytes conteúdo.
 * @returns {Promise<{ path: string, name: string, bytes: number }>} arquivo gravado.
 */
export async function writeUniqueFile({ directory, fileName, bytes }) {
  await mkdir(directory, { recursive: true })
  const parsed = splitName(fileName)
  for (let sequence = 0; sequence < 100; sequence += 1) {
    const candidateName = sequence === 0
      ? `${parsed.stem}.${parsed.extension}`
      : `${parsed.stem}-${sequence + 1}.${parsed.extension}`
    const candidatePath = join(directory, candidateName)
    let handle = null
    try {
      // `wx` falha quando o arquivo existe: nenhuma escrita sobrescreve cópia anterior.
      handle = await open(candidatePath, 'wx', 0o644)
      await handle.writeFile(bytes)
      await handle.close()
      handle = null
      return { path: candidatePath, name: candidateName, bytes: bytes.length }
    } catch (error) {
      if (handle !== null) {
        try { await handle.close() } catch { /* ignora */ }
        await unlink(candidatePath).catch(() => {})
      }
      if (error?.code !== 'EEXIST') throw error
    }
  }
  throw new Error('não foi possível escolher um nome livre para a imagem')
}

/**
 * Separa nome e extensão (a extensão pode ter até 5 caracteres).
 * @param {string} fileName nome completo.
 * @returns {{ stem: string, extension: string }} partes.
 */
export function splitName(fileName) {
  const safe = sanitizeSegment(fileName, 'imagem')
  const dot = safe.lastIndexOf('.')
  if (dot <= 0 || dot === safe.length - 1) return { stem: safe, extension: 'png' }
  return { stem: safe.slice(0, dot), extension: safe.slice(dot + 1).toLowerCase() }
}

/**
 * Caminho relativo (para exibição) de um arquivo dentro do workspace.
 * @param {string} workspacePath raiz do workspace.
 * @param {string} absolutePath arquivo gravado.
 * @returns {string} caminho relativo com separador POSIX.
 */
export function displayRelativePath(workspacePath, absolutePath) {
  return relative(workspacePath, absolutePath).split('\\').join('/')
}

/** Diretório pai de um caminho (reexportado para conveniência dos testes). */
export { dirname, basename }
