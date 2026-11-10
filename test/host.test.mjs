import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  DEFAULT_CONFIG,
  isLoopbackHostname,
  isTrustedRequest,
  parseSessionId,
  readBody,
  resolveConfig,
  resolveWorkspace,
  saveImageCopy,
  sendJson,
} from '../src/index.js'

test('resolveConfig normaliza a pasta e os limites', () => {
  const config = resolveConfig({})
  assert.equal(config.pastedDir, DEFAULT_CONFIG.pastedDir)
  assert.equal(config.dateFolders, true)
  assert.equal(config.saveNativePastes, true)
  assert.equal(config.maxClipboardBytes, DEFAULT_CONFIG.maxClipboardBytes)

  const custom = resolveConfig({ pastedDir: '../fora', dateFolders: false, maxClipboardBytes: 1234, clipboardTimeoutMs: 999999, saveNativePastes: false })
  assert.equal(custom.pastedDir, DEFAULT_CONFIG.pastedDir)
  assert.equal(custom.dateFolders, false)
  assert.equal(custom.saveNativePastes, false)
  assert.equal(custom.maxClipboardBytes, 1234)
  assert.equal(custom.clipboardTimeoutMs, 30_000)
})

test('isLoopbackHostname aceita apenas loopback', () => {
  assert.equal(isLoopbackHostname('localhost'), true)
  assert.equal(isLoopbackHostname('127.0.0.1'), true)
  assert.equal(isLoopbackHostname('127.10.20.30'), true)
  assert.equal(isLoopbackHostname('[::1]'), true)
  assert.equal(isLoopbackHostname('example.com'), false)
  assert.equal(isLoopbackHostname('192.168.0.1'), false)
})

test('isTrustedRequest exige loopback, mesma origem e Sec-Fetch-Site', () => {
  const base = { headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'same-origin', origin: 'http://127.0.0.1:3080' } }
  assert.equal(isTrustedRequest(base), true)
  assert.equal(isTrustedRequest({ headers: { host: '127.0.0.1:3080' } }), true)
  assert.equal(isTrustedRequest({ headers: { host: 'evil.example', 'sec-fetch-site': 'same-origin' } }), false)
  assert.equal(isTrustedRequest({ headers: { host: '127.0.0.1:3080', 'sec-fetch-site': 'cross-site' } }), false)
  assert.equal(isTrustedRequest({ headers: { host: '127.0.0.1:3080', origin: 'http://evil.example' } }), false)
  assert.equal(isTrustedRequest({ headers: {} }), false)
})

test('parseSessionId só aceita ids de sessão do Harness', () => {
  assert.equal(parseSessionId('session-abc-123'), 'session-abc-123')
  assert.equal(parseSessionId('session-abc-123 '), 'session-abc-123')
  assert.equal(parseSessionId('../../etc/passwd'), null)
  assert.equal(parseSessionId(''), null)
  assert.equal(parseSessionId(undefined), null)
})

test('readBody respeita o limite', async () => {
  // Async iterator mínimo imitando um IncomingMessage.
  const body = (chunks) => ({
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield Buffer.from(chunk)
    },
  })
  assert.deepEqual(await readBody(body(['ab', 'cd']), 10), Buffer.from('abcd'))
  await assert.rejects(() => readBody(body(['abcdef']), 4), /limite/)
})

test('sendJson grava cabeçalhos e corpo', () => {
  const captured = {}
  const res = {
    writeHead(status, headers) { captured.status = status; captured.headers = headers },
    end(body) { captured.body = body },
  }
  sendJson(res, 200, { ok: true })
  assert.equal(captured.status, 200)
  assert.equal(captured.headers['Content-Type'], 'application/json; charset=utf-8')
  assert.deepEqual(JSON.parse(captured.body), { ok: true })
})

test('resolveWorkspace usa o workspaceRegistry da sessão', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'colar-imagem-ws-'))
  try {
    const ctx = { get: (service) => service === 'workspaceRegistry' ? { list: () => [{ path: dir, sessionIds: ['session-x'] }] } : undefined }
    assert.equal(await resolveWorkspace(ctx, 'session-x'), dir)
    assert.equal(await resolveWorkspace(ctx, 'session-y'), null)
    assert.equal(await resolveWorkspace({}, 'session-x'), null)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('saveImageCopy grava no workspace com data e nome sugerido', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'colar-imagem-save-'))
  const now = new Date(2026, 10, 9, 23, 55, 10)
  try {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const saved = await saveImageCopy({
      workspacePath: dir,
      bytes,
      mediaType: 'image/png',
      fileName: 'print da tela.png',
      config: resolveConfig({}),
      now,
    })
    assert.equal(saved.relativePath, 'pasted-images/2026-11-09/print da tela.png')
    assert.deepEqual(await readFile(saved.path), bytes)
    assert.equal(saved.bytes, 4)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('saveImageCopy inventa nome datado quando não vem nome', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'colar-imagem-sem-nome-'))
  const now = new Date(2026, 10, 9, 1, 2, 3)
  try {
    const saved = await saveImageCopy({ workspacePath: dir, bytes: Buffer.from('x'), mediaType: 'image/jpeg', config: resolveConfig({ dateFolders: false }), now })
    assert.equal(saved.relativePath, 'pasted-images/colada-2026-11-09-01-02-03.jpg')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
