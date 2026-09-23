# Tutorial de Testes do REVIVE

Este guia mostra como executar a suite de testes do projeto e explica o objetivo de cada camada.

## 1. Pre-requisitos

Antes de rodar os testes, garanta que:

- o Node.js esteja instalado;
- as dependencias da raiz estejam instaladas com `npm install`;
- as dependencias do painel estejam instaladas com `cd revive-painel` e `npm install`.

A configuracao em `vitest.config.mjs` define valores ficticios de Supabase e JWT para os testes rapidos da API. A suite nao precisa de um arquivo `.env` nem de credenciais reais. Os testes de rotas validam as respostas anteriores ao acesso ao banco; o teste de sessoes mobile usa um banco simulado em memoria.

O job `PostgreSQL 17 e API real` do CI complementa esses testes. Ele usa [PostgreSQL 17.6 e PostgREST 12.2.12](../docker-compose.ci.yml) em containers efemeros, aplica todas as migrations desde zero e repete o upgrade com uma fixture legada em outro banco do mesmo container. As [verificacoes de esquema](../supabase/verification/assert_full_schema.sql) e o [teste de API](../tests/db/real-postgres.mjs) cobrem grants, constraints, duas conexoes independentes, isolamento entre contas e exclusao em cascata. O job tambem exige que uma FK invalida e a leitura direta pelo papel `anon` falhem. Todos os dados e segredos do job sao sintéticos e descartados ao final; ele nao usa as chaves nem o banco do REVIVE V2.

Para repetir o job em Linux, macOS ou WSL com Docker Compose e Node.js 22, execute na raiz:

```sh
npm ci
npm run test:db
```

O script remove os volumes dos containers ao terminar, inclusive se um teste falhar. As portas locais `55432` a `55434` precisam estar livres. No Windows, nao e preciso instalar PostgreSQL: use o job do PR no GitHub Actions.

## 2. Estrutura da suite

O projeto foi dividido em quatro grupos principais:

1. Testes unitarios da API
2. Testes de integracao da API
3. Testes unitarios do painel
4. Testes de integracao do painel

Essa separacao existe para dar feedback rapido primeiro e deixar os testes com mais contexto para a camada seguinte.

## 3. Como rodar tudo de uma vez

Na raiz do projeto:

```powershell
npm run validate
```

Esse comando executa, nesta ordem:

1. testes unitarios da API;
2. testes de integracao da API;
3. testes unitarios do painel;
4. testes de integracao do painel;
5. build de producao do painel.

Use esse comando antes de abrir PR, subir branch ou entregar uma alteracao maior.

## 4. Como rodar apenas a API

Na raiz do projeto:

```powershell
npm run test:api
```

Se quiser separar por camada:

```powershell
npm run test:api:unit
npm run test:api:integration
```

### O que os testes unitarios da API fazem

Eles validam funcoes puras e regras pequenas, sem depender de HTTP externo ou banco.

Exemplos atuais:

- sanitizacao de texto;
- formatacao de duracao;
- calculo de estatisticas de abstinencia.

Arquivo principal:

- `tests/unit/helpers.test.js`

### Por que eles sao importantes

- sao os testes mais rapidos da suite;
- isolam bugs de regra de negocio;
- ajudam a refatorar com seguranca.

### O que os testes de integracao da API fazem

Eles exercitam a aplicacao Express de verdade usando `supertest`, sem precisar subir um servidor manualmente.

Exemplos atuais:

- `GET /api/health`;
- validacao do payload em `POST /api/auth/login`;
- validacao do payload em `POST /api/auth/cadastro`.

Arquivo principal:

- `tests/integration/routes.test.js`

### Por que eles sao importantes

- verificam rotas, status code e JSON retornado;
- pegam regressao em middleware, validacao e contrato HTTP;
- custam pouco e entregam alta confianca para backend Express.

## 5. Como rodar apenas o painel

Na raiz do projeto:

```powershell
npm run test:web
```

Ou dentro de `revive-painel`:

```powershell
npm test
```

Se quiser separar por camada:

```powershell
cd revive-painel
npm run test:unit
npm run test:integration
```

### O que os testes unitarios do painel fazem

Eles validam funcoes puras do frontend, sem depender de renderizacao complexa.

Exemplo atual:

- formatacao de tempo decorrido em `src/utils/formatters.test.js`.

### Por que eles sao importantes

- detectam erro de regra visual rapidamente;
- evitam quebrar textos, datas e transformacoes de dados;
- sao baratos de manter.

### O que os testes de integracao do painel fazem

Eles montam contextos, paginas e componentes com Testing Library para validar comportamento real da interface.

Exemplos atuais:

- fluxo de login e armazenamento de token no `AuthContext`;
- tratamento de erro de carregamento no `DataContext`;
- renderizacao de resumo na tela de relatorios.

Arquivos atuais:

- `revive-painel/src/contexts/AuthContext.test.jsx`
- `revive-painel/src/contexts/DataContext.test.jsx`
- `revive-painel/src/pages/ReportsPage.test.jsx`

### Por que eles sao importantes

- cobrem integracao entre estado, hooks e UI;
- simulam o uso real melhor do que um teste puramente unitario;
- pegam regressao onde apps React normalmente quebram.

## 6. Build de producao

Para validar apenas a compilacao do painel:

```powershell
npm run build:web
```

Esse passo garante que:

- o frontend ainda compila;
- imports, bundling e configuracao do Vite continuam validos;
- a aplicacao segue pronta para deploy.

## 7. Quando usar cada comando

- `npm run test:api:unit`: durante alteracoes pequenas em regras de negocio da API.
- `npm run test:api:integration`: ao mexer em rotas, validacoes, middlewares ou respostas HTTP.
- `npm run test:web:unit`: ao alterar utilitarios, formatadores ou servicos puros do painel.
- `npm run test:web:integration`: ao alterar contexto, pagina, fluxo de login ou comportamento visual.
- `npm run validate`: antes de concluir uma tarefa.

## 8. Ordem recomendada no dia a dia

1. rode a camada mais barata relacionada ao que voce alterou;
2. depois rode a camada de integracao correspondente;
3. antes de finalizar, rode `npm run validate`.

Essa ordem reduz tempo de feedback e evita esperar build completo para descobrir erro simples.

## 9. Aplicativo mobile

Na raiz, instale as dependencias com `npm ci --prefix revive-mobile` e execute `npm run validate --prefix revive-mobile`. Esse comando verifica TypeScript, lint e os testes Jest do aplicativo.

Os testes cobrem formularios, datas, funcoes de dominio, cliente HTTP e sincronizacao com dependencias simuladas. Nao equivalem a homologacao em aparelho, E2E completo ou validacao de concorrencia no banco. Consulte as [pendencias](roadmap.md).

## 10. Documentacao e automacao

`npm run check:docs` confere links locais Markdown e atributos HTML `src`/`href` contra os caminhos versionados. Detecta arquivos ausentes, nao versionados e diferencas de maiusculas/minusculas. Os novos arquivos precisam estar no indice do Git. O verificador nao valida URLs externas nem ancoras de secoes.

O [workflow](../.github/workflows/tests.yml) executa dois jobs independentes: API/painel/documentacao e mobile. O CI usa Node.js 22, instalacao por lockfile e valores ficticios de ambiente para testes. Nao acessa o banco de desenvolvimento nem compila um APK.

As [capturas antigas](evidencias-testes/README.md) sao evidencias historicas. Consulte o commit e os logs da execucao no [GitHub Actions](https://github.com/VitorYunguiar/revive/actions/workflows/tests.yml) para conhecer o resultado atual.
