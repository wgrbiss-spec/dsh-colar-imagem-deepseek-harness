import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'

import {
  buildFileName,
  dateFolder,
  destinationDir,
  displayRelativePath,
  normalizePastedDir,
  sanitizeSegment,
  timeStamp,
  workspacePathForSession,
  writeUniqueFile,
} from '../src/save.js'

test('dateFolder e timeStamp usam a data local', () => {
  const now = new Date(2026, 10, 9, 23, 49, 24)
  assert.equal(dateFolder(now), '2026-11-09')
  assert.equal(timeStamp(now), '23-49-24')
})

test('sanitizeSegment neutraliza caminhos e controles', () => {
  assert.equal(sanitizeSegment('../../etc/passwd'), '-..-etc-passwd')
  assert.equal(sanitizeSegment('a/b\\c.png'), 'a-b-c.png')
  assert.equal(sanitizeSegment('   '), 'imagem')
  assert.ok(sanitizeSegment('x'.repeat(500)).length <= 120)
})

test('normalizePastedDir aceita relativo e recusa absoluto/traversal', () => {
  assert.equal(normalizePastedDir('pasted-images'), 'pasted-images')
  assert.equal(normalizePastedDir('imagens\\coladas/2026'), 'imagens/coladas/2026')
  assert.equal(normalizePastedDir('/etc/passwd'), 'pasted-images')
  assert.equal(normalizePastedDir('../../fora'), 'pasted-images')
  assert.equal(normalizePastedDir('C:\\Windows'), 'pasted-images')
  assert.equal(normalizePastedDir(''), 'pasted-images')
})

test('buildFileName gera nome datado com extensão correta', () => {
  const now = new Date(2026, 10, 9, 8, 5, 4)
  assert.equal(buildFileName({ mediaType: 'image/png', now }), 'colada-2026-11-09-08-05-04.png')
  assert.equal(buildFileName({ mediaType: 'image/jpeg', now, sequence: 2 }), 'colada-2026-11-09-08-05-04-3.jpg')
})

test('destinationDir fica contido no workspace e aceita data', () => {
  const now = new Date(2026, 10, 9, 12, 0, 0)
  const dir = destinationDir('/tmp/ws', 'pasted-images', now, true)
  assert.equal(dir, '/tmp/ws/pasted-images/2026-11-09')
  assert.equal(destinationDir('/tmp/ws', 'coladas', now, false), '/tmp/ws/coladas')
})

test('workspacePathForSession encontra o workspace da sessão', () => {
  const registry = {
    list: () => [
      { path: '/tmp/outro', sessionIds: ['session-a'] },
      { path: '/tmp/ws', sessionIds: ['session-b', 'session-c'] },
    ],
  }
  assert.equal(workspacePathForSession(registry, 'session-c'), '/tmp/ws')
  assert.equal(workspacePathForSession(registry, 'session-x'), null)
  assert.equal(workspacePathForSession(null, 'session-c'), null)
  assert.equal(workspacePathForSession({ list: () => { throw new Error('boom') } }, 'session-c'), null)
})

test('writeUniqueFile nunca sobrescreve cópia anterior', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'colar-imagem-'))
  try {
    const first = await writeUniqueFile({ directory: dir, fileName: 'colada.png', bytes: Buffer.from('um') })
    const second = await writeUniqueFile({ directory: dir, fileName: 'colada.png', bytes: Buffer.from('dois') })
    assert.equal(first.name, 'colada.png')
    assert.equal(second.name, 'colada-2.png')
    assert.equal((await readFile(first.path, 'utf8')), 'um')
    assert.equal((await readFile(second.path, 'utf8')), 'dois')
    assert.equal(displayRelativePath(dir, second.path), 'colada-2.png')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeUniqueFile grava byte a byte sem transformar a imagem', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'colar-imagem-bytes-'))
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff])
  try {
    const written = await writeUniqueFile({ directory: dir, fileName: 'x.png', bytes })
    assert.deepEqual(await readFile(written.path), bytes)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('writeUniqueFile usa nome padrão quando o desejado é vazio', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'colar-imagem-nome-'))
  try {
    const written = await writeUniqueFile({ directory: dir, fileName: '   ', bytes: Buffer.from('x') })
    assert.equal(written.name, 'imagem.png')
    await writeFile(join(dir, 'marcador'), 'ok')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
