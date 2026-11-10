#!/usr/bin/env node
/**
 * Publica o plugin no npm com as checagens mínimas.
 *
 * Uso:
 *   npm run publish:npm            # testa, valida e publica
 *   npm run publish:npm -- --dry-run
 *
 * Não cria conta nem faz login: isso é feito por você (`npm login`).
 * Se a conta npm estiver no modo "Authorization and Publishing", rode
 * `npm publish --access public --otp=SEU_CODIGO` no seu terminal.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dryRun = process.argv.includes('--dry-run')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, npm_config_cache: process.env.npm_config_cache ?? join(root, '..', '.npm-cache') },
    ...options,
  })
  if (result.status !== 0) {
    console.error(`\nFalhou: ${command} ${args.join(' ')}`)
    process.exit(result.status ?? 1)
  }
}

console.log(`\nCOLAR IMAGEM DEEPSEEK HARNESS @ ${pkg.version}\n`)

if (typeof pkg.repository?.url !== 'string' || !pkg.repository.url.includes('github.com')) {
  console.error('Defina repository.url no package.json (use `node scripts/set-owner.mjs <usuario>`).')
  process.exit(1)
}

run('npm', ['test'])
run('node', ['scripts/validate-package.mjs'])

const who = spawnSync('npm', ['whoami'], { cwd: root, encoding: 'utf8', env: process.env })
if (who.status !== 0) {
  console.error('\nVocê não está autenticado no npm. Rode `npm login` e tente de novo.')
  process.exit(1)
}
console.log(`\nConta npm: ${String(who.stdout).trim()}`)

if (dryRun) {
  run('npm', ['pack', '--dry-run'])
  console.log('\nDry-run concluído: nada foi publicado.')
  process.exit(0)
}

run('npm', ['publish', '--access', 'public'])
console.log(`\nPublicado: https://www.npmjs.com/package/${pkg.name}`)
console.log('Próximos passos (só na primeira vez):')
console.log('  1. criar o repositório GitHub e dar push (veja publish/PRIMEIRA-PUBLICACAO.md)')
console.log('  2. abrir o PR do catálogo em awesome-dsh-plugin/awesome-dsh-plugin')
console.log('  3. após o merge, o build noturno atualiza o Discover; versões futuras não pedem PR.')
