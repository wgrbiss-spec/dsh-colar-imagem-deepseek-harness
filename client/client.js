/**
 * COLAR IMAGEM DEEPSEEK HARNESS — metade browser (bundle lazy-CJS).
 *
 * O que faz:
 *  - Substitui o menu nativo (em inglês) do campo de mensagem por um menu do
 *    DeepSeek Harness com "Colar imagem", "Colar", "Recortar", "Copiar" e
 *    "Selecionar tudo" no idioma do app.
 *  - "Colar imagem" lê a área de transferência pelo host (o navegador do app
 *    Desktop não tem permissão de `clipboard.read()`), anexa a imagem ao
 *    rascunho pelo mesmo pipeline nativo (prévia, limites, upload) e guarda uma
 *    cópia em `pasted-images/AAAA-MM-DD/` dentro do workspace da sessão.
 *  - Opcionalmente também guarda cópia das imagens coladas com Ctrl+V, sem
 *    tocar no fluxo nativo.
 *
 * Metade host: rotas `/colar-imagem-deepseek-harness/*`.
 */
window.__ModuleLoader__.load({
  id: 'dsh-colar-imagem-deepseek-harness',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    var react = require('react')
    var h = react.createElement

    //#region constantes
    var ROUTE = '/colar-imagem-deepseek-harness'
    var STORAGE_SETTINGS = 'dsh-colar-imagem:settings'
    var STORAGE_LANG = 'dsh-colar-imagem:lang'
    var PLUGIN_ID = 'colar-imagem-deepseek-harness'
    var HOST_TIMEOUT_MS = 8000
    var PROBE_TIMEOUT_MS = 700
    var MENU_TARGET = 'composer'
    //#endregion

    //#region estilos
    var CSS_ID = 'dsh-colar-imagem-deepseek-harness/styles.css'
    var CSS_TEXT = [
      '.dci_section{display:flex;flex-direction:column;gap:16px;width:100%;max-width:760px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px}',
      '.dci_head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 2px}',
      '.dci_head_title{display:flex;flex-direction:column;gap:2px;min-width:0}',
      '.dci_title{font-size:14px;line-height:22px;font-weight:650}',
      '.dci_intro{margin:0;padding:0 2px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}',
      '.dci_group{display:flex;flex-direction:column;gap:12px;padding:20px;box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);border-radius:16px;background:var(--dsw-alias-bg-layer-3)}',
      '.dci_group_head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;font-size:13px;line-height:20px;font-weight:600}',
      '.dci_row{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:11px 2px;border-top:1px solid var(--dsw-alias-border-l2)}',
      '.dci_row:first-child{border-top:none;padding-top:4px}',
      '.dci_row_label{display:flex;flex-direction:column;gap:1px;min-width:0}',
      '.dci_row_title{font-size:13px;line-height:20px;font-weight:500;color:var(--dsw-alias-label-primary)}',
      '.dci_row_desc{font-size:11px;line-height:16px;color:var(--dsw-alias-label-tertiary)}',
      '.dci_row_value{display:flex;align-items:center;gap:8px;flex:none}',
      '.dci_switch{position:relative;display:inline-flex;align-items:center;width:36px;height:20px;flex:none;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);cursor:pointer;transition:background .12s ease,border-color .12s ease}',
      '.dci_switch:disabled{cursor:default;opacity:.5}',
      '.dci_switch[aria-checked="true"]{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#3b82f6));border-color:transparent}',
      '.dci_knob{position:absolute;top:2px;left:2px;width:14px;height:14px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.35);transition:transform .12s ease}',
      '.dci_switch[aria-checked="true"] .dci_knob{transform:translateX(16px)}',
      '.dci_field{display:flex;flex-direction:column;gap:4px;padding:11px 2px;border-top:1px solid var(--dsw-alias-border-l2)}',
      '.dci_input{height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;min-width:220px;box-sizing:border-box}',
      '.dci_input:focus{outline:1px solid var(--dsw-alias-border-focus,var(--dsw-alias-brand-primary,#3b82f6));outline-offset:-1px}',
      '.dci_actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
      '.dci_btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-weight:500;cursor:pointer;transition:background .12s ease,border-color .12s ease}',
      '.dci_btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-label-dimmed)}',
      '.dci_btn:disabled{cursor:default;opacity:.6}',
      '.dci_btn_primary{border-color:transparent;background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#3b82f6));color:var(--dsw-alias-label-primary-foreground,#fff);font-weight:600}',
      '.dci_btn_primary:hover:not(:disabled){filter:brightness(1.08);background:var(--dsw-alias-button-primary-hover,var(--dsw-alias-brand-primary,#3b82f6))}',
      '.dci_lang{display:flex;align-items:center;gap:6px}',
      '.dci_lang_btn{height:28px;padding:0 11px;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:16px;font-weight:600;letter-spacing:.04em;cursor:pointer;transition:background .12s ease,border-color .12s ease,color .12s ease}',
      '.dci_lang_btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);border-color:var(--dsw-alias-label-dimmed)}',
      '.dci_lang_on,.dci_lang_on:disabled{background:var(--dsw-alias-button-primary-fill,var(--dsw-alias-brand-primary,#3b82f6));border-color:transparent;color:var(--dsw-alias-label-primary-foreground,#fff);opacity:1;cursor:default}',
      '.dci_status{display:flex;align-items:flex-start;gap:8px;padding:12px 14px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary)}',
      '.dci_dot{display:inline-block;width:7px;height:7px;border-radius:50%;flex:none;margin-top:6px;background:var(--dsw-alias-state-success-primary,#10b981)}',
      '.dci_dot_warn{background:var(--dsw-alias-state-warn-primary,#f59e0b)}',
      '.dci_dot_error{background:var(--dsw-alias-state-error-primary,#ef4444)}',
      '.dci_note{margin:0;font-size:11px;line-height:17px;color:var(--dsw-alias-label-tertiary)}',
      '.dci_error{margin:0;font-size:11px;line-height:17px;color:var(--dsw-alias-state-error-primary,#ef4444);word-break:break-word}',
      '.dci_code{font-family:var(--dsw-font-mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:11px;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:6px;padding:1px 6px}',
    ].join('\n')

    function ensureStyles() {
      if (typeof document === 'undefined') return
      var tag = document.querySelector('style[data-plugin-css="' + CSS_ID + '"]')
      if (tag === null) {
        tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-colar-imagem-deepseek-harness'
        tag.dataset.pluginCss = CSS_ID
        document.head.appendChild(tag)
      }
      tag.textContent = CSS_TEXT
    }
    //#endregion

    //#region textos (PT + EN)
    var COPY = {
      pt: {
        name: 'COLAR IMAGEM DEEPSEEK HARNESS',
        shortName: 'COLAR IMAGEM',
        pt: 'PORTUGUÊS',
        en: 'INGLÊS',
        intro: 'Cola imagens da área de transferência no campo de mensagem pelo menu do botão direito.',
        behavior: 'Comportamento',
        enable: 'Ativar o menu Colar no campo de mensagem',
        enableDesc: 'Substitui o menu nativo (em inglês) por um menu do Harness com os itens abaixo.',
        saveCopy: 'Guardar uma cópia no workspace',
        saveCopyDesc: 'As imagens coladas viram arquivos dentro do projeto, além do anexo da mensagem.',
        saveNative: 'Guardar cópia também no Ctrl+V',
        saveNativeDesc: 'Mantém a colagem nativa e grava a mesma cópia no workspace.',
        folder: 'Pasta das cópias',
        folderDesc: 'Caminho relativo ao workspace. A data é adicionada em subpasta:',
        apply: 'Aplicar',
        status: 'Diagnóstico',
        statusDesc: 'Confere o que está disponível na área de transferência agora.',
        testClipboard: 'Testar área de transferência',
        pasteNow: 'Colar agora',
        testing: 'Lendo…',
        statusImage: 'Imagem disponível na área de transferência',
        statusText: 'Texto disponível na área de transferência',
        statusEmpty: 'Área de transferência vazia',
        statusUnsupported: 'Leitura da área de transferência indisponível neste sistema',
        statusError: 'Falha ao ler a área de transferência',
        lastSaved: 'Última cópia gravada',
        none: 'nenhuma ainda',
        footer: 'Funciona no app Desktop. Ctrl+V continua funcionando normalmente; use o botão direito para escolher "Colar imagem".',
        savedToast: 'Imagem colada e salva em',
        attachedToast: 'Imagem anexada ao rascunho',
        savedFailedToast: 'Imagem anexada; a cópia no workspace falhou',
        nothingToPaste: 'Nada para colar na área de transferência',
        unsupported: 'este sistema não expõe a área de transferência para o plugin',
        composerBusy: 'O composer está enviando uma mensagem; tente novamente em instantes',
        pasteFailed: 'Não foi possível colar; tente de novo',
        actionFailed: 'Esta ação não está disponível agora',
        imageAttached: 'Imagem colada',
        permissionDenied: 'Permissão de área de transferência negada',
        unreadable: 'Conteúdo não reconhecido na área de transferência',
        pasteImage: 'Colar imagem',
        pasteText: 'Colar',
        paste: 'Colar',
        cut: 'Recortar',
        copy: 'Copiar',
        selectAll: 'Selecionar tudo',
      },
      en: {
        name: 'COLAR IMAGEM DEEPSEEK HARNESS',
        shortName: 'PASTE IMAGE',
        pt: 'PORTUGUESE',
        en: 'ENGLISH',
        intro: 'Paste clipboard images into the message composer with the right-click menu.',
        behavior: 'Behavior',
        enable: 'Enable the Paste menu in the composer',
        enableDesc: 'Replaces the native (English) menu with a Harness menu containing the items below.',
        saveCopy: 'Keep a copy in the workspace',
        saveCopyDesc: 'Pasted images also become files inside the project, besides the message attachment.',
        saveNative: 'Keep a copy for Ctrl+V too',
        saveNativeDesc: 'Leaves the native paste untouched and writes the same copy into the workspace.',
        folder: 'Copies folder',
        folderDesc: 'Path relative to the workspace. The date is added as a subfolder:',
        apply: 'Apply',
        status: 'Diagnostics',
        statusDesc: 'Checks what is available in the clipboard right now.',
        testClipboard: 'Test clipboard',
        pasteNow: 'Paste now',
        testing: 'Reading…',
        statusImage: 'Image available in the clipboard',
        statusText: 'Text available in the clipboard',
        statusEmpty: 'Clipboard is empty',
        statusUnsupported: 'Clipboard reading is unavailable on this system',
        statusError: 'Could not read the clipboard',
        lastSaved: 'Last saved copy',
        none: 'none yet',
        footer: 'Works in the Desktop app. Ctrl+V keeps working as usual; use the right mouse button to pick "Paste image".',
        savedToast: 'Image pasted and saved to',
        attachedToast: 'Image attached to the draft',
        savedFailedToast: 'Image attached; the workspace copy failed',
        nothingToPaste: 'Nothing to paste in the clipboard',
        unsupported: 'this system does not expose the clipboard to the plugin',
        composerBusy: 'The composer is sending a message; try again in a moment',
        pasteFailed: 'Could not paste; try again',
        actionFailed: 'This action is not available right now',
        imageAttached: 'Image pasted',
        permissionDenied: 'Clipboard permission denied',
        unreadable: 'Unrecognized clipboard content',
        pasteImage: 'Paste image',
        pasteText: 'Paste',
        paste: 'Paste',
        cut: 'Cut',
        copy: 'Copy',
        selectAll: 'Select all',
      },
    }

    function detectLang() {
      try {
        var stored = window.localStorage.getItem(STORAGE_LANG)
        if (stored === 'pt' || stored === 'en') return stored
      } catch { /* localStorage indisponível */ }
      var nav = typeof navigator !== 'undefined' && typeof navigator.language === 'string' ? navigator.language.toLowerCase() : 'en'
      return nav.indexOf('pt') === 0 ? 'pt' : 'en'
    }

    var lang = detectLang()
    function c() {
      return COPY[lang] ?? COPY.en
    }
    function setLang(next) {
      if (next !== 'pt' && next !== 'en') return
      lang = next
      try { window.localStorage.setItem(STORAGE_LANG, next) } catch { /* ignora */ }
      if (typeof renderSettings === 'function') renderSettings()
      refreshSectionLabels()
    }
    //#endregion

    //#region configuração local
    var hostConfig = { pastedDir: 'pasted-images', dateFolders: true, saveNativePastes: true, maxClipboardBytes: 52428800 }

    function loadStoredSettings() {
      try {
        var raw = window.localStorage.getItem(STORAGE_SETTINGS)
        if (typeof raw !== 'string' || raw.length === 0) return {}
        var parsed = JSON.parse(raw)
        return parsed !== null && typeof parsed === 'object' ? parsed : {}
      } catch {
        return {}
      }
    }

    var stored = loadStoredSettings()
    var settings = {
      enabled: stored.enabled === undefined ? true : stored.enabled !== false,
      saveCopy: stored.saveCopy === undefined ? true : stored.saveCopy !== false,
      saveNative: stored.saveNative === undefined ? hostConfig.saveNativePastes !== false : stored.saveNative !== false,
      pastedDir: typeof stored.pastedDir === 'string' && stored.pastedDir.trim().length > 0 ? stored.pastedDir.trim() : hostConfig.pastedDir,
    }

    function persistSettings() {
      try { window.localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(settings)) } catch { /* ignora */ }
    }
    //#endregion

    //#region estado de sessão/editor
    /** Sessão dona do composer montado (vem do slot de sondagem). */
    var currentSessionId = null
    /** Editor Lexical capturado no gesto de botão direito. */
    var activeEditor = null
    /** Última cópia gravada (relativa ao workspace), para o diagnóstico. */
    var lastSaved = null
    /** Contexto Cordis do plugin, guardado para os handlers. */
    var pluginCtx = null
    /** Repintar a seção de Configurações quando o idioma/status muda. */
    var settingsInvalidate = null
    function refreshSectionLabels() {
      if (typeof settingsInvalidate === 'function') settingsInvalidate()
    }

    function renderSettings() { refreshSectionLabels() }

    function sessionIdFromValue(value) {
      if (value !== null && typeof value === 'object' && typeof value.sessionId === 'string') return value.sessionId
      return currentSessionId
    }
    //#endregion

    //#region utilidades HTTP
    function abortAfter(ms) {
      var controller = new AbortController()
      var timer = window.setTimeout(function () { controller.abort() }, ms)
      return { signal: controller.signal, cancel: function () { window.clearTimeout(timer) } }
    }

    async function requestJson(path, init, timeoutMs) {
      var timer = abortAfter(timeoutMs ?? HOST_TIMEOUT_MS)
      try {
        var response = await fetch(ROUTE + path, Object.assign({ credentials: 'same-origin' }, init ?? {}, { signal: timer.signal }))
        var body = null
        try { body = await response.json() } catch { body = null }
        if (!response.ok) {
          var detail = body !== null && typeof body.error === 'string' ? body.error : ('HTTP ' + response.status)
          var error = new Error(detail)
          error.code = body !== null && typeof body.code === 'string' ? body.code : 'http-' + response.status
          throw error
        }
        return body ?? {}
      } finally {
        timer.cancel()
      }
    }

    async function loadHostConfig() {
      try {
        var payload = await requestJson('/config', { method: 'GET' }, 4000)
        if (payload !== null && typeof payload === 'object' && payload.defaults !== null && typeof payload.defaults === 'object') {
          hostConfig = Object.assign({}, hostConfig, payload.defaults)
          if (typeof hostConfig.pastedDir === 'string' && hostConfig.pastedDir.length > 0 && stored.pastedDir === undefined) {
            settings.pastedDir = hostConfig.pastedDir
          }
          if (stored.saveNative === undefined) settings.saveNative = hostConfig.saveNativePastes !== false
        }
      } catch { /* usa os padrões locais */ }
    }

    function probeClipboard() {
      return requestJson('/clipboard', { method: 'GET' }, PROBE_TIMEOUT_MS)
    }

    function readClipboard(sessionId) {
      var query = '?sessionId=' + encodeURIComponent(sessionId) + (settings.saveCopy ? '' : '&save=0')
      return requestJson('/read' + query, { method: 'POST' }, HOST_TIMEOUT_MS)
    }

    async function saveNativeBytes(file, sessionId) {
      if (typeof sessionId !== 'string' || sessionId.length === 0) return null
      var bytes = new Uint8Array(await file.arrayBuffer())
      var timer = abortAfter(HOST_TIMEOUT_MS)
      try {
        var response = await fetch(ROUTE + '/save?sessionId=' + encodeURIComponent(sessionId), {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'content-type': 'application/octet-stream',
            'x-media-type': file.type || 'image/png',
            'x-file-name': encodeURIComponent(file.name || 'imagem.png'),
          },
          body: bytes,
          signal: timer.signal,
        })
        var body = null
        try { body = await response.json() } catch { body = null }
        return response.ok && body !== null && typeof body.relativePath === 'string' ? body : null
      } finally {
        timer.cancel()
      }
    }
    //#endregion

    //#region colagem
    function notify(text, success) {
      if (pluginCtx === null) return
      try {
        pluginCtx.contextMenus.notify(String(text), success === true)
      } catch { /* sem menu disponível */ }
    }

    function composerConversation() {
      if (pluginCtx === null) return null
      try { return pluginCtx.get('conversation') ?? null } catch { return null }
    }

    function sessionsService() {
      if (pluginCtx === null) return null
      try { return pluginCtx.sessions ?? pluginCtx.get('sessions') ?? null } catch { return null }
    }

    function findEditor() {
      if (activeEditor !== null && activeEditor.isConnected) return activeEditor
      var found = document.querySelector('[data-lexical-editor="true"][contenteditable="true"], [contenteditable="true"]')
      activeEditor = found
      return found
    }

    function focusEditor(editor) {
      if (editor === null) return false
      try {
        editor.focus()
        return document.activeElement === editor
      } catch {
        return false
      }
    }

    function selectAllEditor(editor) {
      if (editor === null) return false
      var selection = window.getSelection()
      if (selection === null) return false
      var range = document.createRange()
      range.selectNodeContents(editor)
      selection.removeAllRanges()
      selection.addRange(range)
      return true
    }

    function base64ToBytes(base64) {
      var binary = window.atob(base64)
      var bytes = new Uint8Array(binary.length)
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      return bytes
    }

    function fileFromPayload(payload) {
      var bytes = base64ToBytes(String(payload.base64 ?? ''))
      var mediaType = typeof payload.mediaType === 'string' && payload.mediaType.length > 0 ? payload.mediaType : 'image/png'
      var name = typeof payload.name === 'string' && payload.name.length > 0 ? payload.name : 'imagem-colada.png'
      return new File([bytes], name, { type: mediaType })
    }

    /**
     * Anexa uma imagem ao rascunho pelo pipeline nativo do composer.
     * @param {File} file arquivo de imagem.
     * @param {string} sessionId sessão alvo.
     */
    async function attachImage(file, sessionId) {
      var conversation = composerConversation()
      if (conversation === null) throw new Error(c().pasteFailed)
      if (typeof conversation.createDrafts !== 'function') throw new Error(c().pasteFailed)
      var drafts = conversation.createDrafts(sessionId, [file], true)
      if (!Array.isArray(drafts) || drafts.length === 0) throw new Error(c().pasteFailed)
      var ids = drafts.map(function (draft) { return draft.id })
      var sessions = sessionsService()
      var actx = null
      try { actx = sessions !== null && typeof sessions.scope === 'function' ? sessions.scope(sessionId) : null } catch { actx = null }
      var input = actx !== null ? conversation.input.for(actx) : null
      if (input === null || typeof input.addAttachments !== 'function') {
        if (typeof conversation.releaseDraftAttachments === 'function') copyRelease(conversation, drafts)
        throw new Error(c().pasteFailed)
      }
      var accepted = input.addAttachments(ids)
      if (accepted !== true) {
        copyRelease(conversation, drafts)
        throw new Error(c().composerBusy)
      }
      try { if (typeof input.focus === 'function') input.focus() } catch { /* ignora */ }
      return drafts
    }

    function copyRelease(conversation, drafts) {
      try { conversation.releaseDraftAttachments(drafts) } catch { /* ignore */ }
    }

    /**
     * Insere texto no ponto do cursor do composer (execCommand e fallback pelo
     * evento público do input).
     * @param {string} text texto a inserir.
     * @param {string | null} sessionId sessão do composer.
     */
    function insertText(text, sessionId) {
      var editor = findEditor()
      if (editor !== null && focusEditor(editor)) {
        var inserted = false
        try { inserted = document.execCommand('insertText', false, text) === true } catch { inserted = false }
        if (inserted) return true
      }
      if (sessionId === null) return false
      var conversation = composerConversation()
      var sessions = sessionsService()
      if (conversation === null || sessions === null) return false
      try {
        var actx = sessions.scope(sessionId)
        var input = conversation.input.for(actx)
        var state = input.state.getSnapshot()
        var pos = typeof state.draft === 'string' ? state.draft.length : 0
        actx.emit('slash/input-insert-text', { text: text, span: { start: pos, end: pos, draftRev: state.draftRev } })
        return true
      } catch {
        return false
      }
    }

    /** Fallback quando o host não tem ferramenta de área de transferência. */
    async function readClipboardFromBrowser() {
      var clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : null
      if (clipboard === null || clipboard === undefined) return null
      try {
        if (typeof clipboard.read === 'function') {
          var items = await clipboard.read()
          for (var i = 0; i < items.length; i++) {
            var types = Array.isArray(items[i].types) ? items[i].types : []
            var imageType = types.find(function (type) { return /^image\//.test(type) })
            if (typeof imageType === 'string') {
              var blob = await items[i].getType(imageType)
              return { kind: 'image', mediaType: imageType, file: new File([blob], 'imagem-colada.' + (imageType.split('/')[1] || 'png'), { type: imageType }) }
            }
          }
        }
        if (typeof clipboard.readText === 'function') {
          var value = await clipboard.readText()
          if (typeof value === 'string' && value.length > 0) return { kind: 'text', text: value }
        }
      } catch {
        return null
      }
      return null
    }

    /**
     * Executa a colagem pedida pelo menu.
     * @param {'auto'|'image'|'text'} mode intenção do item de menu.
     * @param {string | null} sessionId sessão capturada no gesto.
     */
    async function pasteFromClipboard(mode, sessionId) {
      var session = sessionId ?? currentSessionId
      if (typeof session !== 'string' || session.length === 0) throw new Error(c().pasteFailed)
      var payload = null
      try {
        payload = await readClipboard(session)
      } catch (error) {
        payload = { ok: false, kind: 'unsupported', code: error?.code ?? 'host-failed', error: error instanceof Error ? error.message : String(error) }
      }
      if (payload !== null && payload.ok === true && payload.kind === 'image') {
        var file = fileFromPayload(payload)
        await attachImage(file, session)
        if (typeof payload.relativePath === 'string' && payload.relativePath.length > 0) {
          lastSaved = payload.relativePath
          notify(c().savedToast + ' ' + payload.relativePath, true)
          refreshSectionLabels()
        } else {
          notify(c().attachedToast, true)
        }
        return
      }
      if (payload !== null && payload.ok === true && payload.kind === 'text' && mode !== 'image') {
        if (insertText(String(payload.text ?? ''), session) !== true) throw new Error(c().actionFailed)
        return
      }
      // Fallback: navegador (web/Electron com permissão) quando o host não lê.
      var browserRead = await readClipboardFromBrowser()
      if (browserRead !== null && browserRead.kind === 'image' && mode !== 'text') {
        await attachImage(browserRead.file, session)
        notify(c().attachedToast, true)
        return
      }
      if (browserRead !== null && browserRead.kind === 'text' && mode !== 'image') {
        if (insertText(browserRead.text, session) !== true) throw new Error(c().actionFailed)
        return
      }
      if (payload !== null && payload.kind === 'empty') {
        notify(c().nothingToPaste, false)
        return
      }
      if (payload !== null && payload.kind === 'unsupported') {
        throw new Error(c().unsupported)
      }
      throw new Error(c().pasteFailed)
    }

    function runEditorCommand(command) {
      var editor = findEditor()
      if (editor === null) throw new Error(c().actionFailed)
      focusEditor(editor)
      var ok = false
      try { ok = document.execCommand(command) === true } catch { ok = false }
      if (!ok) throw new Error(c().actionFailed)
    }

    function hasSelection() {
      var selection = window.getSelection()
      return selection !== null && selection.rangeCount > 0 && selection.isCollapsed === false
    }
    //#endregion

    //#region menu de contexto
    function isComposerEditor(node) {
      if (node === null || typeof node !== 'object' || typeof node.closest !== 'function') return null
      var editor = node.closest('[data-lexical-editor="true"]')
      if (editor !== null) return editor
      var editable = node.closest('[contenteditable="true"]')
      if (editable !== null && editable.getAttribute('data-lexical-editor') === 'true') return editable
      return null
    }

    function menuActions(sessionId, probe) {
      var copy = c()
      var actions = []
      var kind = probe !== null && typeof probe.kind === 'string' ? probe.kind : 'unknown'
      if (kind === 'image') {
        actions.push({
          id: 'colar-imagem:paste-image',
          label: copy.pasteImage,
          failureLabel: copy.pasteFailed,
          run: function () { return pasteFromClipboard('image', sessionId) },
        })
      } else if (kind === 'text') {
        actions.push({
          id: 'colar-imagem:paste-text',
          label: copy.pasteText,
          failureLabel: copy.pasteFailed,
          run: function () { return pasteFromClipboard('text', sessionId) },
        })
      } else if (kind === 'empty') {
        actions.push({ id: 'colar-imagem:paste-empty', label: copy.paste, disabled: true })
      } else {
        actions.push({
          id: 'colar-imagem:paste',
          label: copy.paste,
          failureLabel: copy.pasteFailed,
          run: function () { return pasteFromClipboard('auto', sessionId) },
        })
      }
      var selected = hasSelection()
      actions.push({
        id: 'colar-imagem:cut',
        label: copy.cut,
        separatorBefore: true,
        disabled: selected !== true,
        failureLabel: copy.actionFailed,
        run: function () { runEditorCommand('cut') },
      })
      actions.push({
        id: 'colar-imagem:copy',
        label: copy.copy,
        disabled: selected !== true,
        failureLabel: copy.actionFailed,
        run: function () { runEditorCommand('copy') },
      })
      actions.push({
        id: 'colar-imagem:select-all',
        label: copy.selectAll,
        separatorBefore: true,
        failureLabel: copy.actionFailed,
        run: function () {
          var editor = findEditor()
          if (editor === null || selectAllEditor(editor) !== true) throw new Error(c().actionFailed)
        },
      })
      return actions
    }

    function attachContextMenu(ctx) {
      return ctx.effect(function () {
        var onContextMenu = function (event) {
          if (settings.enabled !== true) return
          var editor = isComposerEditor(event.target)
          if (editor === null) return
          if (typeof currentSessionId !== 'string' || currentSessionId.length === 0) return
          var sessionId = currentSessionId
          activeEditor = editor
          event.preventDefault()
          event.stopPropagation()
          if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation()
          try {
            ctx.contextMenus.open(
              { kind: MENU_TARGET, value: { sessionId: sessionId } },
              { x: event.clientX, y: event.clientY },
            )
          } catch { /* overlay indisponível */ }
        }
        document.addEventListener('contextmenu', onContextMenu, true)
        return function () { document.removeEventListener('contextmenu', onContextMenu, true) }
      }, 'colar-imagem: contexto do composer')
    }

    function registerMenuContribution(ctx) {
      return ctx.effect(function () {
        return ctx.contextMenus.register({
          id: 'colar-imagem:' + MENU_TARGET,
          target: MENU_TARGET,
          order: 0,
          resolve: async function (value, signal) {
            var sessionId = sessionIdFromValue(value)
            if (typeof sessionId !== 'string' || sessionId.length === 0) return []
            var probe = null
            try {
              probe = await probeClipboard()
            } catch {
              probe = null
            }
            if (signal !== undefined && signal.aborted) return []
            return menuActions(sessionId, probe)
          },
        })
      }, 'colar-imagem: contribuição de menu')
    }
    //#endregion

    //#region Ctrl+V: cópia no workspace
    function attachNativePasteCopyHook(ctx) {
      return ctx.effect(function () {
        var onPaste = function (event) {
          if (settings.enabled !== true || settings.saveNative !== true) return
          var data = event.clipboardData
          if (data === null || data === undefined || data.items === null || data.items === undefined) return
          var sessionId = currentSessionId
          if (typeof sessionId !== 'string' || sessionId.length === 0) return
          var files = []
          for (var i = 0; i < data.items.length && files.length < 8; i++) {
            var item = data.items[i]
            if (item === null || item.kind !== 'file' || typeof item.type !== 'string' || item.type.indexOf('image/') !== 0) continue
            var file = typeof item.getAsFile === 'function' ? item.getAsFile() : null
            if (file !== null) files.push(file)
          }
          if (files.length === 0) return
          for (var j = 0; j < files.length; j++) {
            var candidate = files[j]
            if (typeof candidate.size === 'number' && candidate.size > hostConfig.maxClipboardBytes) continue
            void saveNativeBytes(candidate, sessionId).then(function (saved) {
              if (saved !== null && typeof saved.relativePath === 'string') {
                lastSaved = saved.relativePath
                refreshSectionLabels()
              }
            }).catch(function (error) {
              notify(c().savedFailedToast + ': ' + (error instanceof Error ? error.message : String(error)), false)
            })
          }
        }
        document.addEventListener('paste', onPaste, false)
        return function () { document.removeEventListener('paste', onPaste, false) }
      }, 'colar-imagem: cópias do Ctrl+V')
    }
    //#endregion

    //#region slot de sondagem da sessão
    function SessionProbe(props) {
      currentSessionId = typeof props.sessionId === 'string' ? props.sessionId : null
      return null
    }

    function registerSessionProbe(ctx) {
      return ctx.effect(function () {
        return ctx.slots.inject('conversation.input.left', function () {
          return ctx.slots.register(
            {
              name: 'conversation.input.left',
              id: PLUGIN_ID + '-probe',
              order: 0,
              inject: function (sessionId) { return { sessionId: sessionId } },
            },
            SessionProbe,
          )
        })
      }, 'colar-imagem: sonda de sessão')
    }
    //#endregion

    //#region seção em Configurações
    var useSettingsState = null

    function buildSettingsStateHook() {
      var listeners = new Set()
      var version = 0
      var subscribers = new Set()
      useSettingsState = function () {
        var pair = react.useState(version)
        var setVersion = pair[1]
        react.useEffect(function () {
          var listener = function () { setVersion(function (value) { return value + 1 }) }
          subscribers.add(listener)
          return function () { subscribers.delete(listener) }
        }, [])
        return { version: version, invalidate: function () { version += 1; subscribers.forEach(function (fn) { fn() }) } }
      }
      settingsInvalidate = function () {
        version += 1
        subscribers.forEach(function (fn) { try { fn() } catch { /* ignora */ } })
      }
      void listeners
    }

    function Switch(props) {
      return h('button', {
        type: 'button',
        role: 'switch',
        'aria-checked': props.checked === true ? 'true' : 'false',
        className: 'dci_switch',
        disabled: props.disabled === true,
        'aria-label': props.label,
        onClick: props.onChange,
      }, h('span', { className: 'dci_knob' }))
    }

    function Row(props) {
      return h('div', { className: 'dci_row' },
        h('div', { className: 'dci_row_label' },
          h('span', { className: 'dci_row_title' }, props.title),
          props.desc ? h('span', { className: 'dci_row_desc' }, props.desc) : null),
        h('div', { className: 'dci_row_value' }, props.children))
    }

    function StatusLine(props) {
      var tone = props.tone === 'error' ? 'dci_dot dci_dot_error' : props.tone === 'warn' ? 'dci_dot dci_dot_warn' : 'dci_dot'
      return h('div', { className: 'dci_status' },
        h('span', { className: tone, 'aria-hidden': true }),
        h('span', null, props.children))
    }

    function LangSwitch() {
      return h('div', { className: 'dci_lang' },
        h('button', {
          type: 'button',
          className: 'dci_lang_btn' + (lang === 'pt' ? ' dci_lang_on' : ''),
          disabled: lang === 'pt',
          onClick: function () { setLang('pt') },
        }, c().pt),
        h('button', {
          type: 'button',
          className: 'dci_lang_btn' + (lang === 'en' ? ' dci_lang_on' : ''),
          disabled: lang === 'en',
          onClick: function () { setLang('en') },
        }, c().en))
    }

    function SettingsSection() {
      var copy = c()
      var state = useSettingsState()
      var folderDraft = react.useState(settings.pastedDir)
      var folderValue = folderDraft[0]
      var setFolderValue = folderDraft[1]
      var diagDraft = react.useState(null)
      var diag = diagDraft[0]
      var setDiag = diagDraft[1]
      var busyDraft = react.useState(false)
      var busy = busyDraft[0]
      var setBusy = busyDraft[1]
      void state

      function update(patch) {
        settings = Object.assign({}, settings, patch)
        persistSettings()
        settingsInvalidate?.()
      }

      function applyFolder() {
        var next = String(folderValue ?? '').trim()
        update({ pastedDir: next.length > 0 ? next : 'pasted-images' })
        setFolderValue(next.length > 0 ? next : 'pasted-images')
      }

      async function testClipboard() {
        setBusy(true)
        setDiag(null)
        try {
          var probe = await probeClipboard()
          setDiag({ tone: 'ok', text: probe.kind === 'image' ? copy.statusImage + (probe.mediaType ? ' (' + probe.mediaType + ')' : '') : probe.kind === 'text' ? copy.statusText : probe.kind === 'empty' ? copy.statusEmpty : copy.statusUnsupported })
        } catch (error) {
          setDiag({ tone: 'error', text: copy.statusError + ': ' + (error instanceof Error ? error.message : String(error)) })
        } finally {
          setBusy(false)
        }
      }

      async function pasteNow() {
        setBusy(true)
        setDiag(null)
        try {
          await pasteFromClipboard('auto', currentSessionId)
          setDiag({ tone: 'ok', text: copy.imageAttached })
        } catch (error) {
          setDiag({ tone: 'error', text: copy.statusError + ': ' + (error instanceof Error ? error.message : String(error)) })
        } finally {
          setBusy(false)
        }
      }

      return h('div', { className: 'dci_section' },
        h('div', { className: 'dci_head' },
          h('div', { className: 'dci_head_title' },
            h('span', { className: 'dci_title' }, copy.name),
            h('span', { className: 'dci_intro' }, copy.intro)),
          h(LangSwitch, null)),
        h('div', { className: 'dci_group' },
          h('div', { className: 'dci_group_head' }, h('span', null, copy.behavior)),
          h(Row, { title: copy.enable, desc: copy.enableDesc },
            h(Switch, { checked: settings.enabled, label: copy.enable, onChange: function () { update({ enabled: settings.enabled !== true }) } })),
          h(Row, { title: copy.saveCopy, desc: copy.saveCopyDesc },
            h(Switch, {
              checked: settings.saveCopy !== false,
              disabled: settings.enabled !== true,
              label: copy.saveCopy,
              onChange: function () { update({ saveCopy: settings.saveCopy === false }) },
            })),
          h(Row, { title: copy.saveNative, desc: copy.saveNativeDesc },
            h(Switch, {
              checked: settings.saveNative === true,
              disabled: settings.enabled !== true || settings.saveCopy === false,
              label: copy.saveNative,
              onChange: function () { update({ saveNative: settings.saveNative !== true }) },
            }))),
        h('div', { className: 'dci_group' },
          h('div', { className: 'dci_group_head' }, h('span', null, copy.folder)),
          h('div', { className: 'dci_field' },
            h('span', { className: 'dci_row_desc' }, copy.folderDesc),
            h('div', { className: 'dci_actions' },
              h('input', {
                className: 'dci_input',
                type: 'text',
                value: folderValue,
                spellCheck: false,
                onChange: function (event) { setFolderValue(event.target.value) },
                onKeyDown: function (event) { if (event.key === 'Enter') applyFolder() },
              }),
              h('button', { type: 'button', className: 'dci_btn', onClick: applyFolder }, copy.apply))),
          h('p', { className: 'dci_note' },
            h('span', { className: 'dci_code' }, '<workspace>/' + (settings.pastedDir || 'pasted-images') + '/' + (hostConfig.dateFolders === false ? '' : 'AAAA-MM-DD/')),
            ' ',
            'colada-AAAA-MM-DD-HH-MM-SS.png')),
        h('div', { className: 'dci_group' },
          h('div', { className: 'dci_group_head' }, h('span', null, copy.status)),
          h('p', { className: 'dci_note' }, copy.statusDesc),
          h('div', { className: 'dci_actions' },
            h('button', { type: 'button', className: 'dci_btn', onClick: testClipboard, disabled: busy }, busy ? copy.testing : copy.testClipboard),
            h('button', { type: 'button', className: 'dci_btn dci_btn_primary', onClick: pasteNow, disabled: busy }, copy.pasteNow)),
          diag !== null ? h(StatusLine, { tone: diag.tone }, diag.text) : null,
          h('div', { className: 'dci_row' },
            h('div', { className: 'dci_row_label' },
              h('span', { className: 'dci_row_title' }, copy.lastSaved),
              h('span', { className: 'dci_row_desc' }, lastSaved === null ? copy.none : lastSaved))),
        h('p', { className: 'dci_note' }, copy.footer)))
    }

    function registerSettingsSections(ctx) {
      var icon = ctx.slots.inject('settings.section.icon', function () {
        return ctx.slots.register({
          name: 'settings.section.icon',
          id: PLUGIN_ID,
          order: 130,
          label: function () { return c().shortName },
        }, function (props) {
          var size = props !== null && typeof props === 'object' && typeof props.size === 'number' ? props.size : 16
          return h('svg', {
            width: size,
            height: size,
            viewBox: '0 0 16 16',
            fill: 'none',
            'aria-hidden': true,
          },
          h('rect', { x: 2.2, y: 3.2, width: 9.2, height: 9.6, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.3 }),
          h('path', { d: 'M4.3 10.2l1.9-2 1.6 1.6 1.2-1.2 1.8 1.9', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', strokeLinejoin: 'round' }),
          h('path', { d: 'M11.5 2.2h2.3v2.3', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round' }))
        })
      })
      var section = ctx.slots.inject('settings.section', function () {
        return ctx.slots.register({
          name: 'settings.section',
          id: PLUGIN_ID,
          order: 130,
          label: function () { return c().shortName },
        }, SettingsSection)
      })
      return function () {
        try { icon() } catch { /* ignora */ }
        try { section() } catch { /* ignora */ }
      }
    }
    //#endregion

    //#region plugin
    /** Diagnóstico somente-leitura, útil para suporte e para os testes dev. */
    function publishDiagnostics() {
      try {
        window.__COLAR_IMAGEM__ = {
          version: '0.1.0',
          state: function () {
            return { sessionId: currentSessionId, enabled: settings.enabled, saveCopy: settings.saveCopy, saveNative: settings.saveNative, pastedDir: settings.pastedDir, lang: lang, lastSaved: lastSaved, hostConfig: hostConfig }
          },
          probe: probeClipboard,
        }
      } catch { /* janela sem permissão de global */ }
    }

    function apply(ctx) {
      pluginCtx = ctx
      buildSettingsStateHook()
      ensureStyles()
      publishDiagnostics()
      void loadHostConfig()
      registerSessionProbe(ctx)
      attachContextMenu(ctx)
      registerMenuContribution(ctx)
      attachNativePasteCopyHook(ctx)
      registerSettingsSections(ctx)
    }

    exports.apply = apply
    exports.inject = ['slots', 'contextMenus', 'sessions']
    return module.exports
  },
})
