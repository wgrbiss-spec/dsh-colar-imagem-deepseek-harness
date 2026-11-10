# Publicação — COLAR IMAGEM DEEPSEEK HARNESS

Guia para publicar no npm e submeter ao catálogo comunitário que alimenta o
marketplace do DSH / DSH Tauri. Verificado em 2026-11-09 contra as fontes
oficiais do plugin de saldo (mesma trilha de publicação).

> **Primeira vez, sem conta ainda?** Siga
> [`PRIMEIRA-PUBLICACAO.md`](./PRIMEIRA-PUBLICACAO.md): cadastro npm + GitHub,
> 2FA, publicação e PR do catálogo passo a passo.

> O dono dos links já está configurado para `wgrbiss-spec`. Se um dia mudar de
> usuário, rode `node scripts/set-owner.mjs <novo-usuario>` e confira com
> `npm run validate`.

---

## 0. Pré-requisitos

- Conta npm com 2FA configurado (publicação pede OTP).
- Repositório GitHub público com o código, tópico `dsh-plugin`.
- Nome npm livre: `npm view dsh-colar-imagem-deepseek-harness` deve retornar 404.
- Node.js >= 22. O plugin é JS puro: não precisa de build nem de pnpm para instalar.

## 1. Validar localmente

```sh
npm test                 # testes unitários (clipboard, caminhos, rotas)
npm run validate         # manifesto, bundle patch, client lazy-CJS, files[], engines, secrets
npm pack --dry-run       # lista exatamente o que será publicado
```

O `npm pack` deve incluir: `src/`, `client/`, `assets/`, `cordis.patch.yml`,
`README.md`, `README.pt-BR.md`, `LICENSE`. Testes, `dev/`, `scripts/` e
`publish/` ficam fora do tarball por não estarem em `files[]` (continuam
linkáveis no repositório).

## 2. Publicar no npm

```sh
npm publish --access public
```

Confira:

```sh
npm view dsh-colar-imagem-deepseek-harness version dist.tarball repository.url engines.dsh
```

Regras que o catálogo/gerador usam:

- `repository.url` do pacote **precisa** apontar para o mesmo repo do catálogo
  (mapeamento npm ↔ repo).
- `engines.dsh` de topo é a única faixa de compatibilidade lida pelo DSH.
- `dsh.bundle.patch` é obrigatório — é a causa nº 1 de rejeição.
- `dsh.client.platform` precisa ser `web` e o `exports["./client"]` precisa
  existir; sem isso a parte do navegador não carrega.

## 3. GitHub (repo, tópico e release)

1. Crie `github.com/<owner>/dsh-colar-imagem-deepseek-harness` e envie o código.
2. Adicione o tópico `dsh-plugin` no repositório.
3. Opcional: tag/release `v0.1.0` com o `.tgz` anexado. O catálogo aceita
   `tarball:` como alternativa ao npm, mas a entrada só aparece no
   `index.json`/Discover com pacote npm — então publique no npm.

## 4. Submeter ao catálogo comunitário

O catálogo é o repositório **awesome-dsh-plugin/awesome-dsh-plugin** (o
`dshmarket` só consome; PR de plugin no repo do market é recusado).

1. Fork de `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin`.
2. Adicione **um** arquivo
   `data/plugins/wgrbiss-spec__dsh-colar-imagem-deepseek-harness.yml` com o
   conteúdo de [`catalog-entry.yml`](./catalog-entry.yml).
3. Valide no fork:

   ```sh
   npm ci
   node scripts/generate-readme.mjs
   node scripts/build-index.mjs --check
   ```

4. Abra o PR (no máximo 3 entradas por PR, sem editar READMEs gerados nem
   entradas de terceiros). O CI verde é pré-condição; a revisão humana lê o
   repo e confere cada afirmação da descrição.
5. Após o merge, o build noturno roda `probe-npm → build-index` e publica o
   pacote `dsh-plugin-catalog` se o hash mudou. O app passa a listar o plugin
   no Discover.

## 5. Verificar no app

- **DSH Desktop:** Configurações → Plugins → Discover → procure
  `COLAR IMAGEM DEEPSEEK HARNESS` → instalar → **reiniciar o app** (a metade
  host registra as rotas HTTP na inicialização).
- **`dsh web`:** `dsh plugin --profile web add dsh-colar-imagem-deepseek-harness`
  e reinicie.
- Clique com o botão direito no campo de mensagem e confira **Colar imagem**.
- Abra Configurações → **COLAR IMAGEM** e use o **Diagnóstico** para ver o
  clipboard atual.

## 6. Nota sobre o CI (escopo `workflow`)

O arquivo `.github/workflows/ci.yml` só pode ser versionado por um token com o
escopo **`workflow`** (além de `repo`). Um PAT sem esse escopo recebe:

```text
refusing to allow a Personal Access Token to create or update workflow
`.github/workflows/ci.yml` without `workflow` scope
```

Opções:

1. Gerar um token clássico com `repo` + `workflow` e rodar `git push`; ou
2. Adicionar o arquivo pela interface web do GitHub (**Add file → Upload files**).

O restante do repositório (código, docs, assets, kit de publicação) publica
normalmente sem esse escopo.

## 7. Atualizações

- Bump de versão **não** exige novo PR no catálogo: o próximo probe noturno
  atualiza o `index.json`.
- Se a compatibilidade com o DSH mudar, atualize `engines.dsh` no
  `package.json` e em `publish/index-entry.json`.
