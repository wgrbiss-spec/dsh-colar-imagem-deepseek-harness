import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  CLIPBOARD_CODES,
  extensionForMediaType,
  normalizeMediaType,
  parseTargetList,
  pickImageTarget,
  pickTextTarget,
  probeClipboard,
  providersFor,
  readClipboard,
} from '../src/clipboard.js'

/** Runner falso: mapeia comando+argumentos para um resultado previsível. */
function fakeRun(table) {
  return async (command, args) => {
    const key = `${command} ${args.join(' ')}`
    const entry = table[key]
    if (entry === undefined) {
      return { ok: false, missing: true, code: 'ENOENT', stdout: Buffer.alloc(0), stderr: Buffer.alloc(0), error: 'not found' }
    }
    if (entry instanceof Error) {
      return { ok: false, missing: false, code: 1, stdout: Buffer.alloc(0), stderr: Buffer.from(entry.message), error: entry.message }
    }
    return { ok: true, missing: false, code: 0, stdout: Buffer.isBuffer(entry) ? entry : Buffer.from(entry), stderr: Buffer.alloc(0), error: null }
  }
}

const PNG = Buffer.from('89504e470d0a1a0a', 'hex')

test('normalizeMediaType remove parâmetros e normaliza caixa', () => {
  assert.equal(normalizeMediaType('TEXT/PLAIN;charset=utf-8'), 'text/plain')
  assert.equal(normalizeMediaType(' image/png '), 'image/png')
  assert.equal(normalizeMediaType(undefined), '')
})

test('pickImageTarget prefere PNG e ignora tipos desconhecidos', () => {
  const targets = ['TIMESTAMP', 'text/plain', 'image/jpeg', 'image/png']
  assert.equal(pickImageTarget(targets), 'image/png')
  assert.equal(pickImageTarget(['text/plain']), null)
  assert.equal(pickImageTarget(null), null)
})

test('pickTextTarget aceita UTF8_STRING e text/plain com charset', () => {
  assert.equal(pickTextTarget(['TARGETS', 'UTF8_STRING', 'text/plain']), 'UTF8_STRING')
  assert.equal(pickTextTarget(['text/plain;charset=utf-8']), 'text/plain;charset=utf-8')
  assert.equal(pickTextTarget(['image/png']), null)
})

test('parseTargetList limpa linhas vazias e TIMESTAMP', () => {
  const list = parseTargetList(Buffer.from('TIMESTAMP\nTARGETS\nimage/png\n\ntext/plain\n'))
  assert.deepEqual(list, ['TARGETS', 'image/png', 'text/plain'])
})

test('extensionForMediaType mapeia os formatos aceitos', () => {
  assert.equal(extensionForMediaType('image/png'), 'png')
  assert.equal(extensionForMediaType('image/jpeg'), 'jpg')
  assert.equal(extensionForMediaType('image/webp'), 'webp')
  assert.equal(extensionForMediaType('application/octet-stream'), 'bin')
})

test('providersFor prioriza wl-paste no Wayland e xclip no X11', () => {
  assert.equal(providersFor({ platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0', DISPLAY: ':0' } })[0].id, 'wl-paste')
  assert.equal(providersFor({ platform: 'linux', env: { DISPLAY: ':0' } })[0].id, 'xclip')
  assert.equal(providersFor({ platform: 'darwin', env: {} })[0].id, 'macos')
  assert.equal(providersFor({ platform: 'win32', env: {} })[0].id, 'powershell')
})

test('probeClipboard lê os TARGETS do xclip e detecta imagem', async () => {
  const run = fakeRun({
    'xclip -selection clipboard -t TARGETS -o': 'TIMESTAMP\nTARGETS\nimage/png\ntext/plain\n',
  })
  const probe = await probeClipboard({ run, platform: 'linux', env: { DISPLAY: ':0' } })
  assert.equal(probe.available, true)
  assert.equal(probe.tool, 'xclip')
  assert.equal(probe.kind, 'image')
  assert.equal(probe.mediaType, 'image/png')
})

test('probeClipboard detecta texto e vazio', async () => {
  const text = await probeClipboard({
    run: fakeRun({ 'xclip -selection clipboard -t TARGETS -o': 'TARGETS\nUTF8_STRING\n' }),
    platform: 'linux',
    env: { DISPLAY: ':0' },
  })
  assert.equal(text.kind, 'text')

  const empty = await probeClipboard({
    run: fakeRun({ 'xclip -selection clipboard -t TARGETS -o': 'TARGETS\n' }),
    platform: 'linux',
    env: { DISPLAY: ':0' },
  })
  assert.equal(empty.kind, 'empty')
})

test('probeClipboard devolve unsupported quando nenhuma ferramenta existe', async () => {
  const probe = await probeClipboard({ run: fakeRun({}), platform: 'linux', env: { DISPLAY: ':0' } })
  assert.equal(probe.kind, 'unsupported')
  assert.equal(probe.available, false)
  assert.equal(probe.code, CLIPBOARD_CODES.unsupported)
})

test('readClipboard devolve bytes da imagem publicada', async () => {
  const run = fakeRun({
    'xclip -selection clipboard -t TARGETS -o': 'TARGETS\nimage/png\n',
    'xclip -selection clipboard -t image/png -o': PNG,
  })
  const result = await readClipboard({ run, platform: 'linux', env: { DISPLAY: ':0' } })
  assert.equal(result.kind, 'image')
  assert.equal(result.mediaType, 'image/png')
  assert.deepEqual(result.bytes, PNG)
})

test('readClipboard devolve texto quando só há texto', async () => {
  const run = fakeRun({
    'xclip -selection clipboard -t TARGETS -o': 'TARGETS\nUTF8_STRING\n',
    'xclip -selection clipboard -t UTF8_STRING -o': 'olá mundo',
  })
  const result = await readClipboard({ run, platform: 'linux', env: { DISPLAY: ':0' } })
  assert.equal(result.kind, 'text')
  assert.equal(result.text, 'olá mundo')
})

test('readClipboard recusa imagem acima do limite', async () => {
  const run = fakeRun({
    'xclip -selection clipboard -t TARGETS -o': 'TARGETS\nimage/png\n',
    'xclip -selection clipboard -t image/png -o': Buffer.alloc(2048, 1),
  })
  const result = await readClipboard({ run, platform: 'linux', env: { DISPLAY: ':0' }, maxBytes: 1024 })
  assert.equal(result.kind, 'error')
  assert.equal(result.code, CLIPBOARD_CODES.tooLarge)
})

test('readClipboard usa wl-paste no Wayland', async () => {
  const run = fakeRun({
    'wl-paste --list-types': 'image/png\ntext/plain\n',
    'wl-paste --no-newline --type image/png': PNG,
  })
  const result = await readClipboard({ run, platform: 'linux', env: { WAYLAND_DISPLAY: 'wayland-0' } })
  assert.equal(result.kind, 'image')
  assert.equal(result.tool, 'wl-paste')
})
