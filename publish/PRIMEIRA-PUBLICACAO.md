# Primeira publicação — do zero (sem conta ainda)

Este guia é para quem **ainda não tem conta** npm nem GitHub. Leva ~15 minutos
de cadastro + 5 minutos de publicação. Depois da primeira vez, cada nova versão
é só `npm run publish:npm` (o catálogo se atualiza sozinho na madrugada).

> **Importante:** ninguém pode criar essas contas por você. npm e GitHub exigem
> e-mail verificado, CAPTCHA e aceite de termos por uma pessoa, além de 2FA no
> npm. O agente que te acompanha não tem (e não deve ter) acesso ao seu e-mail
> nem às suas senhas. O que dá para automatizar — testes, validação,
> `npm publish`, versionamento e o texto do PR — já está pronto nos scripts
> deste repositório.

## O que você vai criar

| Conta | Para quê | Link |
|---|---|---|
| **npm** | publicar o pacote e aparecer no Discover/marketplace | <https://www.npmjs.com/signup> |
| **GitHub** | hospedar o código e abrir o PR no catálogo comunitário | <https://github.com/signup> |

O nome `dsh-colar-imagem-deepseek-harness` está **livre** no npm (verificado em 2026-11-10).

### "Usuário" não é a conta Google

O **username** é um apelido público que você inventa (tudo minúsculo, sem
espaços; ex.: `welliton`, `welliton-dev`, `colar-imagem`). Ele não é o seu
e-mail nem a conta Google:

- **GitHub** permite "Continue with Google" no cadastro, mas ainda pede que você
  escolha um username do GitHub.
- **npm** não tem login com Google: o cadastro é e-mail + username + senha.

Pode usar o mesmo username nos dois, se estiver livre.

## 1. Conta npm + 2FA

1. Crie a conta em <https://www.npmjs.com/signup> (usuário, e-mail, senha forte).
2. Verifique o e-mail.
3. Em **Account → Two-Factor Authentication**, ative o 2FA e guarde os **recovery codes**.
   - **Authorization only** (recomendado): o `npm publish` roda via token sem pedir OTP a cada vez.
   - **Authorization and Publishing**: mais seguro, mas cada publicação pede OTP.
4. No terminal:

   ```sh
   npm login          # usuário/e-mail, senha e OTP
   npm whoami         # deve imprimir o seu usuário
   ```

## 2. Escolha do nome (opcional)

- Padrão: `dsh-colar-imagem-deepseek-harness` (sem escopo, já livre).
- Com escopo: `@seu-usuario/dsh-colar-imagem-deepseek-harness`. Nesse caso,
  além do `name` no `package.json`, atualize o `name:` do `cordis.patch.yml`,
  o `id` do bundle em `client/client.js` e o prefixo de rotas em `src/index.js`
  (o validador confere o id do bundle contra o nome do pacote).

## 3. Ajustar os links para o seu usuário

```sh
node scripts/set-owner.mjs <seu-usuario-do-github>
npm test && npm run validate
```

Isso troca `wgrbiss-spec` por `<seu-usuario>` em `package.json`, READMEs e nos
arquivos de `publish/`. O PR do catálogo e o `repository` do npm precisam
apontar para o **mesmo** repositório GitHub.

## 4. Publicar no npm

```sh
npm run publish:npm        # testa, valida, confere login e publica
# ou: npm publish --access public
```

Depois confira:

```sh
npm view dsh-colar-imagem-deepseek-harness version repository.url engines.dsh
```

Se a conta estiver em **Authorization and Publishing**, rode no seu terminal:

```sh
npm publish --access public --otp=123456
```

## 5. Repositório no GitHub

1. Crie um repositório **público vazio** chamado `dsh-colar-imagem-deepseek-harness`.
2. Dentro da pasta do plugin:

   ```sh
   git init
   git add .
   git commit -m "COLAR IMAGEM DEEPSEEK HARNESS 0.1.0"
   git branch -M main
   git remote add origin https://github.com/<seu-usuario>/dsh-colar-imagem-deepseek-harness.git
   git push -u origin main
   ```

3. No repositório: **Settings → Topics** → adicione `dsh-plugin`.
4. Opcional: release `v0.1.0` anexando o `.tgz` gerado por `npm pack`.

> O catálogo pede repositório com **pelo menos 1 dia** de vida. Se o CI
> reclamar, abra o PR no dia seguinte — o npm já pode ser publicado hoje.

## 6. Submeter ao catálogo comunitário (PR)

1. Faça fork de <https://github.com/awesome-dsh-plugin/awesome-dsh-plugin>.
2. No seu fork, crie **um** arquivo `data/plugins/<seu-usuario>__dsh-colar-imagem-deepseek-harness.yml`
   com o conteúdo de [`publish/catalog-entry.yml`](./catalog-entry.yml) (já ajustado pelo `set-owner`).
   Pela interface web do GitHub: **Add file → Create new file**, cole e commit.
3. Abra o PR para o repositório original. O CI valida; a revisão humana confere
   o código e as afirmações da descrição.
4. Após o merge, o build noturno publica o `index.json` e o plugin aparece em
   **Configurações → Plugins → Discover** no DSH (e no app DSH Tauri).
5. Atualizações futuras: só `npm version patch && npm run publish:npm` — **não**
   precisa de novo PR.

## 7. Verificar no app

- **DSH Desktop:** Configurações → Plugins → Discover → busque
  `COLAR IMAGEM DEEPSEEK HARNESS` → instalar → **reiniciar o app**.
- **`dsh web`:** `dsh plugin --profile web add dsh-colar-imagem-deepseek-harness`
  e reinicie.

## Sem publicar também funciona

Para testar em outra máquina sem publicar no npm:

```sh
dsh plugin --profile <perfil> add ./dsh-colar-imagem-deepseek-harness-0.1.0.tgz
```

## Problemas comuns na primeira vez

| Sintoma | Solução |
|---|---|
| `npm publish` pede OTP | use `--otp=123456` ou troque o 2FA para *Authorization only* |
| `E402 Payment Required` / pacote privado | confira `publishConfig.access: public` e o escopo |
| `403 Forbidden — package name too similar` | troque para `@seu-usuario/dsh-colar-imagem-deepseek-harness` e atualize nome/id conforme o passo 2 |
| CI do catálogo reclama de repositório novo | aguarde 1 dia e atualize o PR |
| Ícone quebrado no catálogo | publique `assets/icon-180.png` no repo e use a URL `raw.githubusercontent.com` |
| Menu não aparece no app | reinicie o app Desktop (as rotas do Host só sobem na inicialização) |
