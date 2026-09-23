# Issue #11 — atualização de Vite e Vitest

Evidências de 23/09/2026 para a branch `feature/11-vite-vitest-security`, baseada na `main` em `6435c9492f0f264cfc80e23e1ef04e9c219382f4`.

## Matriz de segurança

`npm audit --package-lock-only --json` foi executado separadamente na raiz e em `revive-painel`. Cada árvore tinha 5 pacotes sinalizados; as cadeias se sobrepunham.

| Árvore | Antes (crítica / alta / moderada) | Depois | Versões relevantes antes → depois |
| --- | --- | --- | --- |
| Raiz | 1 / 1 / 3 | 0 / 0 / 0 | Vitest 2.1.9 → 4.1.11; Vite transitivo 5.4.21 → direto 6.4.3 |
| Painel | 1 / 1 / 3 | 0 / 0 / 0 | Vitest 2.1.9 → 4.1.11; Vite 5.4.21 → 6.4.3; plugin React 4.3.1 → 4.7.0 |

| Advisory | Caminho anterior e alcance | Correção |
| --- | --- | --- |
| [GHSA-5xrq-8626-4rwp](https://github.com/advisories/GHSA-5xrq-8626-4rwp) | Vitest 2.1.9: servidor UI/API de testes, sobretudo quando exposto à rede ou em modo browser no Windows. Os scripts atuais não ativam UI/browser nem publicam esse servidor. Não é uma dependência da API em produção. | Vitest 4.1.11, acima de 4.1.0. |
| [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | Vite 5.4.21: servidor de desenvolvimento no Windows quando exposto à rede e com arquivos sensíveis nos diretórios permitidos. `npm run dev:homolog --prefix revive-painel` usa `--host 0.0.0.0` explicitamente; `npm run dev` e os testes usam o host padrão local. O bundle web de produção não executa o servidor Vite. | Vite 6.4.3, versão corrigida da linha 6. |
| [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | `@vitest/mocker`/Vitest 2.1.9: servidor de desenvolvimento e plugins de mock, com risco quando um WebSocket vulnerável fica alcançável. Os testes usam ambiente Node e jsdom, sem browser mode. | Vitest e `@vitest/mocker` 4.1.11. |
| [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9), [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3), [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | Avisos moderados restantes na cadeia antiga Vite/esbuild, usados em desenvolvimento, build e testes. | Vite 6.4.3 e esbuild 0.25.12; nenhum aviso restante no audit dos dois lockfiles. |

Essas classificações descrevem o alcance dos scripts e dependências deste repositório. Não afirmam que um servidor publicado externamente estava seguro. O script de homologação que abre o Vite na rede deve ser usado apenas em ambiente controlado. Nenhum script de teste passa `--host`, `--api.host` ou ativa UI/browser por padrão.

## Escolha e compatibilidade

Vitest 4.1.11 é a menor versão estável da linha corrigida para o advisory do mocker; 2.x e 3.x não receberam essa correção. O peer de Vitest 4.1.11 aceita Vite 6, 7 e 8. Vite 6.4.3 é a menor linha com correção do advisory de alta severidade citado. O plugin React 4.7.0 aceita Vite 6. Node 22 continua definido em `.nvmrc` e no CI. A API Express permanece CommonJS; só a configuração do Vitest passou para `vitest.config.mjs`. Os testes conservam os valores sintéticos `.invalid` e a descoberta de arquivos anterior.

`npm ls vite vitest @vitest/mocker esbuild --depth=2` na raiz e o equivalente no painel (incluindo `@vitejs/plugin-react`) não apontaram peers inválidos. Ambos resolvem Vite 6.4.3, Vitest/`@vitest/mocker` 4.1.11 e esbuild 0.25.12.

## Instalação, validação e recuperação

Com Node 22, em um checkout limpo:

```powershell
npm ci
npm ci --prefix revive-painel
npm ci --prefix revive-mobile
npm run audit:tooling
npm run audit:tooling --prefix revive-painel
npm run validate
npm run validate --prefix revive-mobile
```

No Windows local (Node 22.22.0, npm 10.9.4), os dois `npm ci` afetados passaram sem `--force` ou `--legacy-peer-deps`. `npm run validate` aprovou 16 testes de API, 15 do painel, build web e 118 links locais. O mobile aprovou tipos, lint e 21 testes. O CI Linux executa os mesmos dois audits e as validações em Node 22; vincular o run aprovado ao PR antes da integração.

O `npm install` direto com npm 10.9.4 falhou internamente no Arborist (`Cannot read properties of null (reading 'edgesOut')`) ao resolver os peers opcionais de Vitest 4. Para produzir os lockfiles, foi usado `npx --yes npm@11.20.0 install --save-dev --save-exact ...`; a reprodução final foi confirmada com `npm ci` do npm 10.9.4. Isso não requer trocar o npm usado no CI.

Para reverter a atualização integrada, use `git revert` no commit da issue, incluindo juntos os dois `package.json`, os dois lockfiles, `vitest.config.mjs`/`vitest.config.js` e o workflow. Depois repita `npm ci` nas duas árvores e `npm run validate`. Não há migração de dados ou alteração de contrato da API.
