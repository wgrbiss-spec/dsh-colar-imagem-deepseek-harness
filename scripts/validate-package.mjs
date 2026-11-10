#!/usr/bin/env node
/**
 * Validação local do pacote antes de `npm publish` / PR no catálogo.
 *
 * Confere o que o DSH e o catálogo comunitário realmente leem:
 *  - `dsh.bundle.patch` existe e monta a linha do plugin com o nome do pacote;
 *  - `dsh.client.platform === "web"`, `dsh.client.inject` e o bundle `./client` existem;
 *  - o id registrado no bundle lazy-CJS casa com o nome do pacote e o bundle
 *    registra o menu de contexto + a seção de Configurações;
 *  - entradas do package.json (`main`, `exports`, `files`) apontam para arquivos reais;
 *  - `engines.dsh` cobre a série atual do Harness;
 *  - nenhum segredo óbvio vazou para o pacote.
 *
 * Uso: `npm run validate` (também roda no `prepack`).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []
const notes = []

function fail(message) {
  problems.push(message)
}

function ok(message) {
  notes.push(message)
}

const pkgPath = join(root, 'package.json')
if (!existsSync(pkgPath)) {
  console.error('package.json ausente')
  process.exit(1)
}
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))

if (typeof pkg.name !== 'string' || !/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(pkg.name)) {
  fail(`nome de pacote npm inválido: ${String(pkg.name)}`)
} else {
  ok(`nome npm: ${pkg.name}`)
}

if (typeof pkg.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version)) {
  fail(`versão semver inválida: ${String(pkg.version)}`)
} else {
  ok(`versão: ${pkg.version}`)
}

if (pkg.license !== 'MIT' && typeof pkg.license !== 'string') fail('licença ausente')
if (typeof pkg.description !== 'string' || pkg.description.length < 20) fail('description curta demais para o catálogo')

// Bundle (host): o patch do Cordis deve montar a linha com o nome do pacote.
const bundlePatch = pkg.dsh?.bundle?.patch
if (typeof bundlePatch !== 'string') {
  fail('dsh.bundle.patch ausente — causa nº 1 de rejeição no catálogo')
} else {
  const patchPath = join(root, bundlePatch)
  if (!existsSync(patchPath)) {
    fail(`dsh.bundle.patch não existe: ${bundlePatch}`)
  } else {
    const patch = readFileSync(patchPath, 'utf8')
    if (!patch.includes('insert:')) fail('cordis.patch.yml sem bloco insert:')
    if (!patch.includes(pkg.name)) fail(`cordis.patch.yml não monta o pacote "${pkg.name}"`)
    ok('dsh.bundle.patch monta a linha do plugin')
  }
}

// Client: bundle lazy-CJS servido pelo Host.
if (pkg.dsh?.client?.platform !== 'web') {
  fail('dsh.client.platform deve ser "web"')
} else {
  ok('dsh.client.platform: web')
}
const clientInject = pkg.dsh?.client?.inject
if (!Array.isArray(clientInject) || !clientInject.includes('@deepseek-ai/dsh-client-ui-context-menu')) {
  fail('dsh.client.inject deve declarar @deepseek-ai/dsh-client-ui-context-menu')
} else {
  ok('dsh.client.inject declara o menu de contexto do Harness')
}
const clientExport = pkg.exports?.['./client']
const clientPath = typeof clientExport === 'string'
  ? clientExport
  : (clientExport?.default ?? clientExport?.import)
if (typeof clientPath !== 'string') {
  fail('exports["./client"] ausente — o bundle do navegador não carrega')
} else {
  const absolute = join(root, clientPath)
  if (!existsSync(absolute)) {
    fail(`bundle client ausente: ${clientPath}`)
  } else {
    const bundle = readFileSync(absolute, 'utf8')
    if (!bundle.includes('__ModuleLoader__.load')) fail('client bundle não usa o ModuleLoader (lazy-CJS)')
    const idMatch = bundle.match(/__ModuleLoader__\.load\(\s*\{\s*id:\s*['"]([^'"]+)['"]/)
    if (idMatch === null) fail('client bundle sem `id` no __ModuleLoader__.load')
    else if (idMatch[1] !== pkg.name) fail(`id do bundle (${idMatch[1]}) difere do nome do pacote (${pkg.name})`)
    else ok(`client bundle registra o id "${idMatch[1]}"`)
    if (!/exports\.apply\s*=/.test(bundle)) fail('client bundle não exporta apply')
    if (!/exports\.inject\s*=/.test(bundle)) fail('client bundle não exporta inject')
    if (!bundle.includes('contextMenus.register')) fail('client bundle não registra contribuição no menu de contexto')
    if (!bundle.includes('settings.section')) fail('client bundle não registra settings.section')
  }
}

// main host
const main = pkg.main
if (typeof main !== 'string' || !existsSync(join(root, main))) {
  fail(`main host ausente: ${String(main)}`)
} else {
  const host = readFileSync(join(root, main), 'utf8')
  if (!/export\s+(?:function\s+apply|const\s+name)/.test(host)) fail('host não exporta apply/name')
  ok(`host: ${main}`)
}

// files: tudo o que o pacote precisa deve estar publicado
if (Array.isArray(pkg.files)) {
  const required = ['src', 'client', 'cordis.patch.yml', 'README.md', 'README.pt-BR.md', 'LICENSE', 'assets']
  const missing = required.filter((entry) => !pkg.files.some((file) => file === entry || file.startsWith(entry + '/')))
  if (missing.length > 0) fail(`files[] não inclui: ${missing.join(', ')}`)
  for (const entry of pkg.files) {
    if (!existsSync(join(root, entry.replace(/\/$/, '')))) fail(`files[] aponta para caminho inexistente: ${entry}`)
  }
  ok('files[] cobre host, client, patch, README PT/EN, licença e assets')
} else {
  fail('files[] ausente (o pacote publicaria sobras do repo)')
}

// engines.dsh: precisa cobrir a série atual e não prometer o futuro.
const dshRange = pkg.engines?.dsh
if (typeof dshRange !== 'string' || !dshRange.includes('0.2.')) {
  fail(`engines.dsh deve declarar a série atual (recebido: ${String(dshRange)})`)
} else {
  ok(`engines.dsh: ${dshRange}`)
}

// repository/homepage: o catálogo mapeia npm <-> repo por esses campos.
if (typeof pkg.repository?.url !== 'string' || !pkg.repository.url.includes('github.com')) {
  fail('repository.url deve apontar para o repositório GitHub listado no catálogo')
}
if (typeof pkg.publishConfig?.access !== 'string' || pkg.publishConfig.access !== 'public') {
  fail('publishConfig.access deve ser "public"')
}

// Segredos: varredura simples nos arquivos publicados.
const SECRET_PATTERNS = [
  /x-dsh-auth-token['"]?\s*[:=]\s*['"][^'"]{12,}/i,
  /sk-[A-Za-z0-9]{20,}/,
  /ghp_[A-Za-z0-9]{20,}/,
  /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/,
]
const publishedDirs = ['src', 'client', 'scripts', 'assets', '.github', 'publish']
for (const dir of publishedDirs) {
  const absolute = join(root, dir)
  if (!existsSync(absolute)) continue
  for (const file of walk(absolute)) {
    if (/\.(png|jpg|jpeg|webp|tgz|zip)$/i.test(file)) continue
    const content = readFileSync(file, 'utf8')
    for (const pattern of SECRET_PATTERNS) {
      if (pattern.test(content)) fail(`possível segredo em ${file.replace(root + '/', '')}`)
    }
  }
}

report()

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...walk(path))
    else out.push(path)
  }
  return out
}

function report() {
  for (const note of notes) console.log(`  ok  ${note}`)
  if (problems.length > 0) {
    console.error('\nFalhas:')
    for (const problem of problems) console.error(`  x   ${problem}`)
    console.error(`\n${problems.length} problema(s). Corrija antes de publicar.`)
    process.exit(1)
  }
  console.log('\nPacote válido para publicar no npm e submeter ao catálogo.')
}
