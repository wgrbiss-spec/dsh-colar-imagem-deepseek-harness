# Dev — QA visual e ponta a ponta

Scripts de verificação usados durante o desenvolvimento. Não fazem parte do
pacote publicado (`files[]` não os inclui) e não são necessários para instalar
o plugin.

Pré-requisitos:

- `python3` com Pillow (gera a imagem de teste do clipboard).
- `Xvfb`, `xdpyinfo` e `xclip` (Linux; o script isola a área de transferência
  do usuário em um display próprio).
- `puppeteer-core` + um Chromium/Chrome local. Aponte `PUPPETEER_CORE_DIR` para
  um `node_modules` que tenha o pacote (por exemplo o perfil web do DSH) ou
  instale-o à parte.
- O DSH CLI (`DSH_BIN`, padrão `/usr/lib/node_modules/@deepseek-ai/dsh/lib/bin.js`).

```sh
# Sobe Xvfb + PNG no clipboard + dsh web isolado (DSH_HOME em .e2e/home),
# instala o plugin por link no perfil de teste e roda as 24 verificações.
dev/run-e2e.sh                 # porta padrão 3099
dev/run-e2e.sh 3100            # outra porta

# Saída: um `ok`/`FAIL` por verificação + screenshots em dev/shots/.
```

O que é verificado:

1. composer monta (editor Lexical) e a sondagem de sessão conhece a sessão;
2. botão direito de verdade abre o menu do plugin;
3. o menu tem “Colar imagem” e os itens de edição;
4. “Colar imagem” anexa a imagem ao rascunho (prévia na barra de anexos);
5. a cópia foi gravada em `<workspace>/pasted-images/AAAA-MM-DD/` e é um PNG;
6. com texto no clipboard o menu vira “Colar” e o texto entra no composer;
7. o hook do Ctrl+V grava a cópia no workspace;
8. Configurações abre, a seção do plugin renderiza, o diagnóstico lê o
   clipboard e o alternador PT/EN funciona;
9. nenhum erro de console/página causado pelo plugin.

Limpeza: o script remove `.e2e/home` a cada execução; o diretório `.e2e/` é
ignorado pelo git. As cópias de teste ficam em `.e2e/workspace/pasted-images/`.
