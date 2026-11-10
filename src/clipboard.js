/**
 * Leitura da área de transferência pelo host (Linux X11/Wayland, macOS e
 * Windows best-effort).
 *
 * O navegador do app Desktop não dá ao plugin permissão para `clipboard.read()`
 * sem passar pelo pedido de permissão do shell; por isso a metade host lê a
 * área de transferência do sistema com as ferramentas já presentes na máquina
 * (`xclip`, `wl-paste`, `pbpaste`, PowerShell). Nada sai da máquina: os bytes
 * só atravessam a rota HTTP local do próprio Harness.
 *
 * Módulo sem dependências do Harness: `run` é injetado para os testes.
 */

/** Tipos de imagem aceitos, em ordem de preferência. */
export const IMAGE_TARGETS = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/bmp',
  'image/tiff',
]

/** Tipos de texto aceitos, em ordem de preferência. */
export const TEXT_TARGETS = [
  'text/plain;charset=utf-8',
  'text/plain;charset=UTF-8',
  'UTF8_STRING',
  'text/plain',
  'STRING',
  'TEXT',
]

/** Códigos de erro estáveis devolvidos ao client. */
export const CLIPBOARD_CODES = {
  unsupported: 'clipboard-unsupported',
  tooLarge: 'clipboard-too-large',
  readFailed: 'clipboard-read-failed',
  empty: 'clipboard-empty',
}

/**
 * Normaliza um tipo MIME (remove parâmetros) e devolve o tipo canônico.
 * @param {unknown} value tipo bruto vindo do sistema.
 * @returns {string} tipo normalizado em minúsculas.
 */
export function normalizeMediaType(value) {
  if (typeof value !== 'string') return ''
  return value.split(';', 1)[0].trim().toLowerCase()
}

/**
 * Escolhe o primeiro tipo de imagem presente na lista.
 * @param {readonly string[]} targets tipos publicados pela área de transferência.
 * @returns {string | null} tipo de imagem escolhido (texto cru, como publicado).
 */
export function pickImageTarget(targets) {
  if (!Array.isArray(targets)) return null
  for (const wanted of IMAGE_TARGETS) {
    const found = targets.find((target) => normalizeMediaType(target) === wanted)
    if (found !== undefined) return found
  }
  return null
}

/**
 * Escolhe o primeiro tipo de texto presente na lista.
 * @param {readonly string[]} targets tipos publicados pela área de transferência.
 * @returns {string | null} tipo de texto escolhido (texto cru, como publicado).
 */
export function pickTextTarget(targets) {
  if (!Array.isArray(targets)) return null
  const raws = targets.map((target) => String(target))
  // Primeiro as representações que carregam UTF-8 explicitamente.
  const strict = raws.find((raw) => {
    if (raw.toUpperCase() === 'UTF8_STRING') return true
    return normalizeMediaType(raw) === 'text/plain' && /utf-?8/i.test(raw)
  })
  if (strict !== undefined) return strict
  // Depois qualquer texto simples publicado pelo clipboard.
  for (const fallback of ['text/plain', 'STRING', 'TEXT']) {
    const found = raws.find((raw) => normalizeMediaType(raw) === normalizeMediaType(fallback))
    if (found !== undefined) return found
  }
  return null
}

/**
 * Lê a lista de tipos que uma saída textual multi-linha publica.
 * @param {unknown} output bytes/texto da ferramenta.
 * @returns {string[]} tipos em ordem, sem linhas vazias.
 */
export function parseTargetList(output) {
  const text = Buffer.isBuffer(output)
    ? output.toString('utf8')
    : (typeof output === 'string' ? output : '')
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && line !== 'TIMESTAMP')
}

/**
 * Extensão de arquivo para um tipo de imagem.
 * @param {string} mediaType tipo MIME normalizado.
 * @returns {string} extensão sem ponto.
 */
export function extensionForMediaType(mediaType) {
  switch (normalizeMediaType(mediaType)) {
    case 'image/png': return 'png'
    case 'image/jpeg': return 'jpg'
    case 'image/webp': return 'webp'
    case 'image/gif': return 'gif'
    case 'image/bmp': return 'bmp'
    case 'image/tiff': return 'tiff'
    default: return 'bin'
  }
}

/**
 * Envelopa `execFile` num resultado previsível (nunca lança).
 * @param {{ timeoutMs?: number, maxBufferBytes?: number }} [options] limites padrão.
 * @returns {(command: string, args: string[], options?: object) => Promise<{
 *   ok: boolean, missing: boolean, code: number | string | null,
 *   stdout: Buffer, stderr: Buffer, error: string | null
 * }>} runner.
 */
export function createRunner(options = {}) {
  const defaultTimeout = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000
  const defaultMaxBuffer = Number.isFinite(options.maxBufferBytes) ? options.maxBufferBytes : 64 * 1024 * 1024
  return async function run(command, args, callOptions = {}) {
    const { execFile } = await import('node:child_process')
    return await new Promise((resolve) => {
      const child = execFile(command, args, {
        timeout: Number.isFinite(callOptions.timeoutMs) ? callOptions.timeoutMs : defaultTimeout,
        maxBuffer: Number.isFinite(callOptions.maxBufferBytes) ? callOptions.maxBufferBytes : defaultMaxBuffer,
        encoding: 'buffer',
        windowsHide: true,
        env: callOptions.env ?? process.env,
      }, (error, stdout, stderr) => {
        const out = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout ?? '')
        const err = Buffer.isBuffer(stderr) ? stderr : Buffer.from(stderr ?? '')
        if (error === null || error === undefined) {
          resolve({ ok: true, missing: false, code: 0, stdout: out, stderr: err, error: null })
          return
        }
        const code = typeof error.code === 'number' || typeof error.code === 'string' ? error.code : null
        resolve({
          ok: false,
          missing: error.code === 'ENOENT',
          code,
          stdout: out,
          stderr: err,
          error: error instanceof Error ? error.message : String(error),
        })
      })
      // Um sinal de aborto externo pode encerrar a leitura.
      if (callOptions.signal !== undefined) {
        const abort = () => {
          try { child.kill('SIGKILL') } catch { /* já terminou */ }
        }
        if (callOptions.signal.aborted) abort()
        else callOptions.signal.addEventListener('abort', abort, { once: true })
      }
    })
  }
}

/** Provider X11 (`xclip`). */
export function createX11Provider() {
  const selection = (extra) => ['-selection', 'clipboard', ...extra]
  return {
    id: 'xclip',
    available(env) {
      return typeof env?.DISPLAY === 'string' && env.DISPLAY.length > 0
    },
    async listTargets(run) {
      const result = await run('xclip', selection(['-t', 'TARGETS', '-o']))
      return result
    },
    async readTarget(run, target) {
      return await run('xclip', selection(['-t', target, '-o']))
    },
  }
}

/** Provider Wayland (`wl-paste`). */
export function createWaylandProvider() {
  return {
    id: 'wl-paste',
    available(env) {
      return typeof env?.WAYLAND_DISPLAY === 'string' && env.WAYLAND_DISPLAY.length > 0
    },
    async listTargets(run) {
      return await run('wl-paste', ['--list-types'])
    },
    async readTarget(run, target) {
      return await run('wl-paste', ['--no-newline', '--type', target])
    },
  }
}

/** Classes de clipboard do macOS que interessam (PNG/JPEG primeiro). */
const MAC_IMAGE_CLASSES = ['PNGf', 'JPEG', 'public.png', 'public.jpeg', 'WebP']

/** Provider macOS (`pbpaste` + `osascript`). */
export function createDarwinProvider() {
  return {
    id: 'macos',
    available(env) {
      return env?.platform === 'darwin' || process.platform === 'darwin'
    },
    async listTargets(run) {
      const info = await run('osascript', ['-e', 'clipboard info'])
      if (!info.ok) return info
      const text = info.stdout.toString('utf8')
      const classes = []
      for (const imageClass of MAC_IMAGE_CLASSES) {
        if (text.includes(imageClass)) classes.push(imageClass)
      }
      if (/utf8|string|utf16|text/i.test(text)) classes.push('text/plain')
      return { ok: true, missing: false, code: 0, stdout: Buffer.from(classes.join('\n')), stderr: Buffer.alloc(0), error: null }
    },
    async readTarget(run, target) {
      if (normalizeMediaType(target) === 'text/plain') {
        return await run('pbpaste', [])
      }
      if (target === 'PNGf' || target === 'public.png') {
        return await readMacImageHex(run, 'PNGf')
      }
      return await readMacImageHex(run, target === 'JPEG' || target === 'public.jpeg' ? 'JPEG' : target)
    },
  }
}

/**
 * Lê uma imagem do clipboard do macOS via AppleScript (hex `«data ... »`).
 * @param {Function} run runner injetado.
 * @param {string} clipboardClass classe AppleScript (PNGf/JPEG/...).
 * @returns {Promise<object>} resultado no formato do runner.
 */
async function readMacImageHex(run, clipboardClass) {
  const result = await run('osascript', ['-e', `get the clipboard as «class ${clipboardClass}»`])
  if (!result.ok) return result
  const text = result.stdout.toString('utf8')
  const match = text.match(/«data [^ ]+ ([0-9A-Fa-f]+)»/)
  if (match === null) {
    return { ok: false, missing: false, code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: 'formato de clipboard inesperado' }
  }
  return {
    ok: true,
    missing: false,
    code: 0,
    stdout: Buffer.from(match[1], 'hex'),
    stderr: Buffer.alloc(0),
    error: null,
  }
}

/** Script PowerShell que devolve JSON `{kind, base64|text}` do clipboard. */
const POWERSHELL_CLIPBOARD = [
  'Add-Type -AssemblyName System.Windows.Forms',
  'Add-Type -AssemblyName System.Drawing',
  '$data = [System.Windows.Forms.Clipboard]::GetDataObject()',
  'if ($null -eq $data) { Write-Output "{\\"kind\\":\\"empty\\"}"; exit 0 }',
  '$formats = $data.GetFormats()',
  '$image = $formats -contains [System.Windows.Forms.DataFormats]::Bitmap',
  'if ($image) {',
  '  $bmp = [System.Windows.Forms.Clipboard]::GetImage()',
  '  if ($null -ne $bmp) {',
  '    $ms = New-Object System.IO.MemoryStream',
  '    $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)',
  '    $b64 = [Convert]::ToBase64String($ms.ToArray())',
  '    Write-Output ("{\\"kind\\":\\"image\\",\\"base64\\":\\"" + $b64 + "\\"}")',
  '    exit 0',
  '  }',
  '}',
  'if ($formats -contains [System.Windows.Forms.DataFormats]::UnicodeText) {',
  '  $text = [System.Windows.Forms.Clipboard]::GetText()',
  '  $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($text))',
  '  Write-Output ("{\\"kind\\":\\"text\\",\\"base64\\":\\"" + $b64 + "\\"}")',
  '  exit 0',
  '}',
  'Write-Output "{\\"kind\\":\\"empty\\"}"',
].join('\n')

/** Provider Windows (PowerShell). */
export function createWindowsProvider() {
  const encoded = Buffer.from(POWERSHELL_CLIPBOARD.replace(/\n/g, '\r\n'), 'utf16le').toString('base64')
  return {
    id: 'powershell',
    available(env) {
      return env?.platform === 'win32' || process.platform === 'win32'
    },
    async listTargets(run) {
      const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded])
      if (!result.ok) return result
      // A leitura completa já traz o tipo; a lista usa o mesmo resultado.
      let parsed = null
      try { parsed = JSON.parse(result.stdout.toString('utf8').trim()) } catch { parsed = null }
      const kinds = parsed === null ? [] : (parsed.kind === 'image' ? ['image/png'] : parsed.kind === 'text' ? ['text/plain'] : [])
      return { ok: true, missing: false, code: 0, stdout: Buffer.from(kinds.join('\n')), stderr: Buffer.alloc(0), error: null }
    },
    async readTarget() {
      const result = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded])
      if (!result.ok) return result
      try {
        const parsed = JSON.parse(result.stdout.toString('utf8').trim())
        if (parsed.kind === 'image') return { ok: true, missing: false, code: 0, stdout: Buffer.from(parsed.base64, 'base64'), stderr: Buffer.alloc(0), error: null }
        if (parsed.kind === 'text') return { ok: true, missing: false, code: 0, stdout: Buffer.from(parsed.base64, 'base64').toString('utf8'), stderr: Buffer.alloc(0), error: null }
      } catch { /* cai no erro */ }
      return { ok: false, missing: false, code: null, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: 'clipboard do Windows ilegível' }
    },
  }
}

/**
 * Providers candidatos para a plataforma atual, em ordem de tentativa.
 * @param {{ platform?: string, env?: object }} context plataforma e variáveis.
 * @returns {object[]} providers.
 */
export function providersFor(context = {}) {
  const platform = context.platform ?? process.platform
  const env = { ...process.env, ...(context.env ?? {}), platform }
  if (platform === 'darwin') return [createDarwinProvider()]
  if (platform === 'win32') return [createWindowsProvider()]
  const providers = []
  if (typeof env.WAYLAND_DISPLAY === 'string' && env.WAYLAND_DISPLAY.length > 0) {
    providers.push(createWaylandProvider(), createX11Provider())
  } else if (typeof env.DISPLAY === 'string' && env.DISPLAY.length > 0) {
    providers.push(createX11Provider(), createWaylandProvider())
  } else {
    providers.push(createWaylandProvider(), createX11Provider())
  }
  return providers
}

/**
 * Sonda a área de transferência sem ler os bytes.
 * @param {object} options opções.
 * @param {Function} options.run runner de processos.
 * @param {string} [options.platform] override de plataforma.
 * @param {object} [options.env] override de ambiente.
 * @param {AbortSignal} [options.signal] cancelamento.
 * @returns {Promise<{ available: boolean, tool: string | null, kind: 'image'|'text'|'empty'|'unsupported',
 *   mediaType: string | null, targets: string[], error: string | null, code: string | null }>} sondagem.
 */
export async function probeClipboard({ run, platform, env, signal } = {}) {
  const providers = providersFor({ platform, env })
  for (const provider of providers) {
    if (!provider.available({ ...process.env, ...(env ?? {}), platform: platform ?? process.platform })) continue
    const listed = await provider.listTargets(run, { signal })
    if (!listed.ok) {
      if (listed.missing) continue
      continue
    }
    const targets = parseTargetList(listed.stdout)
    const imageTarget = pickImageTarget(targets)
    if (imageTarget !== null) {
      return { available: true, tool: provider.id, kind: 'image', mediaType: normalizeMediaType(imageTarget), targets, error: null, code: null }
    }
    const textTarget = pickTextTarget(targets)
    if (textTarget !== null) {
      return { available: true, tool: provider.id, kind: 'text', mediaType: 'text/plain', targets, error: null, code: null }
    }
    return { available: true, tool: provider.id, kind: 'empty', mediaType: null, targets, error: null, code: null }
  }
  return { available: false, tool: null, kind: 'unsupported', mediaType: null, targets: [], error: 'nenhuma ferramenta de área de transferência disponível', code: CLIPBOARD_CODES.unsupported }
}

/**
 * Lê o conteúdo atual da área de transferência (imagem tem precedência).
 * @param {object} options opções.
 * @param {Function} options.run runner de processos.
 * @param {string} [options.platform] override de plataforma.
 * @param {object} [options.env] override de ambiente.
 * @param {number} [options.maxBytes] limite de bytes da imagem.
 * @param {AbortSignal} [options.signal] cancelamento.
 * @returns {Promise<object>} resultado com kind: image|text|empty|unsupported.
 */
export async function readClipboard({ run, platform, env, maxBytes, signal } = {}) {
  const limit = Number.isFinite(maxBytes) ? maxBytes : 50 * 1024 * 1024
  const providers = providersFor({ platform, env })
  for (const provider of providers) {
    if (!provider.available({ ...process.env, ...(env ?? {}), platform: platform ?? process.platform })) continue
    const listed = await provider.listTargets(run, { signal })
    if (!listed.ok) continue
    const targets = parseTargetList(listed.stdout)
    const imageTarget = pickImageTarget(targets)
    if (imageTarget !== null) {
      const read = await provider.readTarget(run, imageTarget, { signal })
      if (read.ok && read.stdout.length > 0) {
        if (read.stdout.length > limit) {
          return { kind: 'error', code: CLIPBOARD_CODES.tooLarge, tool: provider.id, error: `imagem com ${read.stdout.length} bytes excede o limite de ${limit} bytes` }
        }
        return { kind: 'image', tool: provider.id, mediaType: normalizeMediaType(imageTarget), bytes: read.stdout }
      }
    }
    const textTarget = pickTextTarget(targets)
    if (textTarget !== null) {
      const read = await provider.readTarget(run, textTarget, { signal })
      if (read.ok && read.stdout.length > 0) {
        const text = read.stdout.toString('utf8')
        if (text.length > 0) return { kind: 'text', tool: provider.id, text }
      }
    }
    return { kind: 'empty', tool: provider.id }
  }
  return { kind: 'unsupported', code: CLIPBOARD_CODES.unsupported, error: 'nenhuma ferramenta de área de transferência disponível' }
}
