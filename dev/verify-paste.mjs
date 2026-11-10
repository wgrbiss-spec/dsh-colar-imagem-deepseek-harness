/**
 * Verificação end-to-end (Puppeteer) do COLAR IMAGEM DEEPSEEK HARNESS.
 *
 * Pré-requisitos: uma instância de teste (`dev/run-e2e.sh`) servindo o plugin,
 * com uma imagem PNG no clipboard do Xvfb usado pelo host.
 *
 * O script confere, de ponta a ponta:
 *  1. o composer monta e a sondagem de sessão conhece a sessão;
 *  2. o botão direito no campo de mensagem abre o menu do plugin;
 *  3. "Colar imagem" anexa a imagem ao rascunho (prévia na barra de anexos);
 *  4. a cópia foi gravada em `<workspace>/pasted-images/AAAA-MM-DD/`;
 *  5. a seção do plugin em Configurações abre e o diagnóstico lê o clipboard.
 */
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const candidates = [process.env.PUPPETEER_CORE_DIR, '/home/welliton/.dsh/profiles/web/node_modules'].filter(Boolean)
let puppeteer = null
for (const dir of candidates) {
  try { puppeteer = createRequire(dir.replace(/\/?$/, '/'))('puppeteer-core'); break } catch { /* tenta o próximo */ }
}
if (puppeteer === null) throw new Error('puppeteer-core não encontrado; defina PUPPETEER_CORE_DIR')

const url = process.env.DSH_TEST_URL
const workspace = process.env.DSH_E2E_WORKSPACE
if (typeof url !== 'string' || url.length === 0) throw new Error('defina DSH_TEST_URL')
if (typeof workspace !== 'string' || workspace.length === 0) throw new Error('defina DSH_E2E_WORKSPACE')

const shots = process.env.DSH_E2E_SHOTS ?? 'dev/shots'
const results = []
function check(name, condition, detail) {
  results.push({ name, ok: condition === true, detail: detail ?? null })
  console.log(`${condition === true ? 'ok  ' : 'FAIL'}  ${name}${detail === undefined || detail === null ? '' : ` — ${detail}`}`)
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--window-size=1920,1200', '--lang=pt-BR'],
  defaultViewport: { width: 1920, height: 1200 },
})
const page = await browser.newPage()
page.on('close', () => console.log('!! page closed'))
browser.on('disconnected', () => console.log('!! browser disconnected'))
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const clickByText = async (texts, exact = false) => page.evaluate((texts, exact) => {
  const els = [...document.querySelectorAll('button, [role="menuitem"], [role="button"]')]
  const target = els.find((el) => {
    const text = (el.textContent || '').trim()
    return texts.some((candidate) => exact ? text === candidate : text.includes(candidate))
  })
  if (!target) return false
  target.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  return true
}, texts, exact)

const visibleMenus = () => page.evaluate(() => [...document.querySelectorAll('[role="menu"]')].filter((el) => {
  const rect = el.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}).map((el) => el.innerText.replace(/\n/g, ' | ')))

const rightClickComposer = async (offsetX = 0) => {
  await page.keyboard.press('Escape')
  await wait(200)
  const rect = await page.evaluate(() => {
    const editor = document.querySelector('[data-lexical-editor="true"]')
    if (editor === null) return null
    const r = editor.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2, width: r.width }
  })
  if (rect === null) return false
  await page.mouse.click(rect.x + offsetX, rect.y, { button: 'right' })
  await wait(1100)
  return true
}

const clickElementByText = async (selector, texts) => {
  const rect = await page.evaluate((selector, texts) => {
    const els = [...document.querySelectorAll(selector)]
    const target = els.find((el) => texts.some((text) => ((el.textContent || '').trim()).includes(text)))
    if (!target) return null
    const r = target.getBoundingClientRect()
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
  }, selector, texts)
  if (rect === null) return false
  await page.mouse.click(rect.x, rect.y)
  return true
}

try {
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 })
  await wait(2500)

  // 1. Aviso inicial (bem-vindo) e workspace de teste.
  for (const label of ['Continuar', 'Continue', 'Entendi', 'Got it']) {
    if (await clickByText([label], true)) { await wait(600); break }
  }
  await clickByText(['e2e'])
  await wait(900)
  await clickByText(['Nova sessão', 'New session'], true)
  await wait(2600)
  for (let i = 0; i < 3; i += 1) { await page.keyboard.press('Escape'); await wait(180) }
  await page.mouse.click(900, 600)
  await wait(400)

  const composer = await page.evaluate(() => {
    const editor = document.querySelector('[data-lexical-editor="true"]')
    if (editor === null) return null
    const rect = editor.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
  const state = await page.evaluate(() => window.__COLAR_IMAGEM__?.state?.() ?? null)
  check('composer montado (editor Lexical)', composer !== null, composer === null ? 'sem editor' : `${Math.round(composer.width)}x${Math.round(composer.height)}`)
  check('plugin ativo e sessão capturada', state !== null && typeof state.sessionId === 'string', state === null ? 'sem diagnóstico' : String(state.sessionId))
  check('padrão: cópia no workspace desligada', state !== null && state.saveCopy === false && state.saveNative === false, state === null ? null : `saveCopy=${state.saveCopy}, saveNative=${state.saveNative}`)
  check('padrão: opção de ocultar o botão de configuração ligada', state !== null && state.hideConfigFile === true, state === null ? null : String(state.hideConfigFile))
  await page.screenshot({ path: join(shots, 'e2e-1-composer.png') })

  // 1b. Configurações: confere os padrões, o botão oculto e liga as cópias.
  await page.evaluate(() => {
    document.querySelector('button[aria-label="Menu da conta"], button[aria-label="Account menu"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await wait(900)
  await clickByText(['Configurações', 'Settings'], true)
  await wait(1200)
  await clickByText(['COLAR IMAGEM'])
  await wait(1100)
  const settingsInfo = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') || document.body
    const switches = [...document.querySelectorAll('[role="dialog"] .dci_switch')]
    return { text: dialog.innerText, switches: switches.map((el) => el.getAttribute('aria-checked')) }
  })
  check('Configurações: 4 opções presentes', settingsInfo.switches.length === 4, settingsInfo.switches.join(','))
  check('padrão das opções (menu on, cópias off, ocultar botão on)', JSON.stringify(settingsInfo.switches) === JSON.stringify(['true', 'false', 'false', 'true']), settingsInfo.switches.join(','))
  const configButton = await page.evaluate(() => {
    const slots = [...document.querySelectorAll('[data-slot="settings.action"]')]
    let found = 0
    let visible = 0
    for (const slot of slots) {
      for (const child of slot.children) {
        if (!/arquivo de configura|configuration file/i.test(child.textContent || '')) continue
        found += 1
        if (getComputedStyle(child).display !== 'none') visible += 1
      }
    }
    return { found, visible }
  })
  check('botão “Abra o arquivo de configuração” oculto', configButton.found > 0 && configButton.visible === 0, `encontrados=${configButton.found}, visíveis=${configButton.visible}`)
  const toggled = await page.evaluate(() => {
    const switches = [...document.querySelectorAll('[role="dialog"] .dci_switch')]
    if (switches.length < 4) return false
    switches[1].click() // "Guardar uma cópia no workspace"
    return true
  })
  await wait(500)
  const toggledNative = await page.evaluate(() => {
    const switches = [...document.querySelectorAll('[role="dialog"] .dci_switch')]
    if (switches.length < 4 || switches[2].disabled === true) return false
    switches[2].click() // "Guardar cópia também no Ctrl+V"
    return true
  })
  await wait(600)
  const afterToggle = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] .dci_switch')].map((el) => el.getAttribute('aria-checked')).join(','))
  check('cópias ligadas manualmente', toggled === true && toggledNative === true && afterToggle === 'true,true,true,true', afterToggle)
  await page.keyboard.press('Escape')
  await wait(700)
  await page.keyboard.press('Escape')
  await wait(400)

  // 2. Botão direito de verdade abre o menu do plugin.
  if (composer !== null) await rightClickComposer()
  const menu = await page.evaluate(() => {
    const menus = [...document.querySelectorAll('[role="menu"]')].filter((el) => {
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden'
    })
    const element = menus[menus.length - 1]
    if (element === undefined) return null
    return [...element.querySelectorAll('[role="menuitem"], button')]
      .map((item) => ({ text: (item.textContent || '').trim(), disabled: item.getAttribute('aria-disabled') === 'true' || item.disabled === true }))
      .filter((item) => item.text.length > 0)
  })
  check('menu de contexto do plugin abriu', menu !== null, menu === null ? 'sem [role=menu]' : menu.map((item) => item.text).join(' | '))
  check('menu tem "Colar imagem"', menu !== null && menu.some((item) => /Colar imagem|Paste image/i.test(item.text)), null)
  check('menu tem os itens de edição', menu !== null && menu.filter((item) => /Recortar|Copiar|Selecionar tudo|Cut|Copy|Select all/i.test(item.text)).length >= 3, null)
  await page.screenshot({ path: join(shots, 'e2e-2-menu.png') })

  // 3. Cola a imagem: anexo no rascunho.
  const clicked = await clickElementByText('[role="menuitem"], [role="menu"] button', ['Colar imagem', 'Paste image'])
  check('clique em "Colar imagem"', clicked === true)
  await wait(3000)

  const rail = await page.evaluate(() => {
    const images = [...document.querySelectorAll('img')].filter((img) => (img.getAttribute('src') || '').startsWith('blob:') || (img.getAttribute('src') || '').startsWith('data:image'))
    return { images: images.length, draftAttachments: document.querySelectorAll('[data-slot="conversation.input.attachments"] img').length }
  })
  check('imagem anexada ao rascunho (prévia)', rail.images > 0 || rail.draftAttachments > 0, `imagens: ${rail.images}, anexos: ${rail.draftAttachments}`)
  const savedState = await page.evaluate(() => window.__COLAR_IMAGEM__?.state?.() ?? null)
  check('toast/registro da cópia salva', savedState !== null && typeof savedState.lastSaved === 'string', savedState === null ? null : String(savedState.lastSaved))
  await page.screenshot({ path: join(shots, 'e2e-3-colada.png') })

  // 4. Cópia gravada no workspace.
  const today = new Date()
  const dateFolder = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const targetDir = join(workspace, 'pasted-images', dateFolder)
  let saved = []
  try { saved = readdirSync(targetDir) } catch { saved = [] }
  check('cópia gravada em pasted-images/AAAA-MM-DD', saved.length > 0, saved.join(', ') || 'nenhum arquivo')
  if (saved.length > 0) {
    const bytes = readFileSync(join(targetDir, saved[0]))
    check('arquivo gravado é um PNG', bytes.length > 8 && bytes[0] === 0x89 && bytes.subarray(1, 4).toString() === 'PNG', `${bytes.length} bytes`)
  }

  // 4b. Texto no clipboard: o menu vira "Colar" simples e insere no composer.
  let textClipboard = false
  try {
    // spawnSync evita herdar pipes do xclip em background.
    spawnSync('xclip', ['-selection', 'clipboard'], { input: 'texto vindo do clipboard', env: process.env, timeout: 5000 })
    await wait(400)
    const targets = spawnSync('xclip', ['-selection', 'clipboard', '-t', 'TARGETS', '-o'], { env: process.env, encoding: 'utf8', timeout: 5000 })
    console.log('clipboard targets apos texto:', (targets.stdout || '').trim().split('\n').join(','))
    textClipboard = typeof targets.stdout === 'string' && !targets.stdout.includes('image/png')
  } catch { textClipboard = false }
  if (textClipboard) {
    await rightClickComposer(37)
    const visible = await visibleMenus()
    const lastMenu = visible.length > 0 ? visible[visible.length - 1] : ''
    const textMenu = lastMenu.length > 0 ? lastMenu.split(' | ') : []
    check('menu se adapta a texto ("Colar")', textMenu.length > 0 && textMenu.some((text) => /^Colar$|^Paste$/i.test(text)) && textMenu.every((text) => !/Colar imagem|Paste image/i.test(text)), textMenu.join(' | '))
    await clickElementByText('[role="menuitem"], [role="menu"] button', ['Colar', 'Paste'])
    await wait(1200)
    const editorText = await page.evaluate(() => document.querySelector('[data-lexical-editor="true"]')?.innerText ?? '')
    check('texto colado no composer', editorText.includes('texto vindo do clipboard'), editorText.slice(0, 80))
  } else {
    check('menu se adapta a texto ("Colar")', false, 'xclip de texto indisponível')
  }

  // 4c. Ctrl+V nativo: o hook grava a cópia sem tocar no fluxo nativo.
  const beforeNative = saved.length
  const nativeDispatched = await page.evaluate(() => {
    const editor = document.querySelector('[data-lexical-editor="true"]')
    if (editor === null) return false
    const data = new DataTransfer()
    const bytes = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])
    data.items.add(new File([bytes], 'ctrlv.png', { type: 'image/png' }))
    editor.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
    return true
  })
  await wait(2500)
  let afterNative = []
  try { afterNative = readdirSync(targetDir) } catch { afterNative = [] }
  check('Ctrl+V também grava cópia no workspace', nativeDispatched === true && afterNative.length > beforeNative, `${beforeNative} -> ${afterNative.length} arquivo(s)`)

  // 5. Seção em Configurações + diagnóstico (abre pelo menu da conta).
  // Devolve a imagem ao clipboard: o cenário anterior deixou texto nele.
  spawnSync('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-i', process.env.DSH_E2E_FIXTURE ?? '.e2e/fixture.png'], { env: process.env, timeout: 5000 })
  await wait(500)
  await page.keyboard.press('Escape')
  await wait(300)
  await page.evaluate(() => {
    const button = document.querySelector('button[aria-label="Menu da conta"], button[aria-label="Account menu"]')
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  await wait(900)
  const settingsOpened = await clickByText(['Configurações', 'Settings'], true)
  await wait(1200)
  let dialogOpen = await page.evaluate(() => document.querySelector('[role="dialog"]') !== null)
  if (dialogOpen !== true) {
    await page.evaluate(() => {
      const button = document.querySelector('button[aria-label="Menu da conta"], button[aria-label="Account menu"]')
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    await wait(800)
    await clickByText(['Configurações', 'Settings'], true)
    await wait(1200)
    dialogOpen = await page.evaluate(() => document.querySelector('[role="dialog"]') !== null)
  }
  check('Configurações abriu', settingsOpened === true && dialogOpen === true, null)
  const section = await clickByText(['COLAR IMAGEM'])
  check('seção aberta em Configurações', section === true)
  await wait(1200)
  const testButton = await clickByText(['Testar área de transferência', 'Test clipboard'])
  await wait(1500)
  const statusText = await page.evaluate(() => (document.querySelector('[role="dialog"]') || document.body).innerText)
  check('diagnóstico leu a imagem do clipboard', testButton === true && /Imagem disponível|Image available/i.test(statusText), statusText.split('\n').filter((line) => /Imagem|clipboard|área de transferência/i.test(line)).slice(0, 3).join(' / '))
  await page.screenshot({ path: join(shots, 'e2e-4-settings-pt.png') })

  // 6. Alternância PT/EN da seção.
  const toEnglish = await clickElementByText('.dci_lang_btn', ['INGLÊS', 'ENGLISH'])
  await wait(900)
  const englishText = await page.evaluate(() => (document.querySelector('[role="dialog"]') || document.body).innerText)
  check('seção alterna para inglês', toEnglish === true && /Behavior|Keep a copy|Diagnostics/i.test(englishText), englishText.split('\n').filter((line) => /Behavior|Copies folder|Diagnostics|Paste image/i.test(line)).slice(0, 3).join(' / '))
  await page.screenshot({ path: join(shots, 'e2e-5-settings-en.png') })
  await clickElementByText('.dci_lang_btn', ['PORTUGUÊS', 'PORTUGUESE'])
  await wait(600)

  // 7. Erros de console (o plugin não pode poluir; erros de conta do ambiente de teste não contam).
  const pluginErrors = errors.filter((line) => !/deepseek-account|account read failed/i.test(line))
  check('sem erros de console/página do plugin', pluginErrors.length === 0, pluginErrors.slice(0, 4).join(' | '))
} finally {
  await browser.close()
}

const failed = results.filter((result) => !result.ok)
console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`)
if (failed.length > 0) {
  console.error('Falhas: ' + failed.map((result) => result.name).join(', '))
  process.exit(1)
}
