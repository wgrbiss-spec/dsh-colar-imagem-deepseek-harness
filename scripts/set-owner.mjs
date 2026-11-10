#!/usr/bin/env node
/**
 * Troca o "dono" dos links (wgrbiss-spec) pelo usuário real do GitHub.
 *
 * Uso:
 *   node scripts/set-owner.mjs <usuario-github>
 *
 * Atualiza package.json (homepage/repository), os READMEs e os arquivos de
 * publicação em publish/. O npm exige que `repository.url` do pacote aponte
 * para o mesmo repositório listado no catálogo.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const owner = process.argv[2]
const PLACEHOLDER = 'wgrbiss-spec'

if (typeof owner !== 'string' || owner.length === 0) {
  console.error('Uso: node scripts/set-owner.mjs <usuario-github>')
  process.exit(1)
}
if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner)) {
  console.error(`Usuário inválido: "${owner}"`)
  process.exit(1)
}

const targets = [
  'package.json',
  'README.md',
  'README.pt-BR.md',
  'publish/catalog-entry.yml',
  'publish/index-entry.json',
]

let changed = 0
for (const relative of targets) {
  const path = join(root, relative)
  const before = readFileSync(path, 'utf8')
  if (!before.includes(PLACEHOLDER)) continue
  const after = before.split(PLACEHOLDER).join(owner)
  writeFileSync(path, after)
  changed += 1
  console.log(`  ok  ${relative}`)
}

if (changed === 0) {
  console.log('Nenhum placeholder encontrado; nada a alterar.')
} else {
  console.log(`\nDono atualizado para "${owner}" em ${changed} arquivo(s).`)
  console.log('Confira com: npm run validate')
}
