# Instalação e configuração

## Pré-requisitos

- Node.js 22, versão usada no CI e indicada em `.nvmrc`.
- npm e Git.
- Para executar a aplicação com dados: projeto Supabase com as migrations de `supabase/migrations` aplicadas.
- Para desenvolver Android: ferramentas descritas no [guia Android](../revive-mobile/docs/android-local.md).

O instalador Windows x64 do Node.js 22.20.0 está na [Release de ferramentas](https://github.com/VitorYunguiar/revive/releases/tag/tools-node-v22.20.0), com origem e checksum. Para outras versões ou sistemas, consulte o [site oficial](https://nodejs.org/en/download).

## 1. Clonar e instalar

```bash
git clone https://github.com/VitorYunguiar/revive.git
cd revive
npm ci
npm ci --prefix revive-painel
```

`npm ci` usa as versões dos arquivos de lock. O mobile tem dependências próprias e não é necessário para executar apenas a API e o painel.

## 2. Configurar a API

Copie `.env.example` para `.env` na raiz. No PowerShell, use `Copy-Item .env.example .env`; no Linux/macOS, use `cp .env.example .env`.

| Variável | Configuração |
| --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Credencial de servidor; nunca inclua no painel ou mobile |
| `JWT_SECRET` | Segredo aleatório e privado para assinatura dos tokens |
| `PORT` | Porta local; padrão `3000` |
| `NODE_ENV` | `development` localmente; `production` na hospedagem |
| `ALLOWED_ORIGINS` | Opcional: origens permitidas, separadas por vírgula |

`SUPABASE_KEY` é um fallback caso `SUPABASE_SERVICE_ROLE_KEY` não esteja definida. O `.env` não deve ser versionado. Para configurar um banco vazio ou adotar um existente, siga o [guia de migração](../supabase/README.md). O baseline já está versionado e deve ser aplicado somente em banco vazio.

## 3. Iniciar API e painel

```bash
npm run dev:stack
```

| Serviço | Endereço padrão |
| --- | --- |
| Painel | `http://localhost:5173` |
| API | `http://localhost:3000/api` |
| Disponibilidade da API | `http://localhost:3000/api/health` |
| Documentação de rotas | `http://localhost:3000/api/docs` |

Também é possível executar `npm run dev` na raiz e `npm run dev --prefix revive-painel` em terminais separados. `npm start` inicia a API sem recarga automática.

Para uma API em outro endereço, copie `revive-painel/.env.example` para `revive-painel/.env.local`, preencha `VITE_API_URL` com o sufixo `/api` e reinicie o Vite. Sem essa variável, o painel usa a porta `3000` no mesmo host em desenvolvimento e `/api` em produção.

## 4. Verificar

```bash
npm run check:docs
npm run validate
```

Os testes usam valores fictícios e não exigem banco ou `.env`. Isso permite verificar o código mesmo sem configurar o ambiente da aplicação. Consulte o [guia de testes](testes.md) para conhecer a cobertura de cada suíte.

## Aplicativo mobile

Instale as dependências com `npm ci --prefix revive-mobile` e siga o [README mobile](../revive-mobile/README.md) para configurar a URL e escolher desenvolvimento local ou build de teste.

## Problemas comuns

| Sintoma | O que conferir |
| --- | --- |
| API não inicia por falta de URL/chave | `.env` na raiz e variáveis do Supabase preenchidas |
| Painel não encontra a API | API iniciada, porta correta e `VITE_API_URL` quando houver endereço personalizado |
| Celular não acessa `localhost` | Use o IP da máquina na rede ou uma API HTTPS; `localhost` no aparelho aponta para ele mesmo |
| Migração falha por tabela inexistente | Confira se o baseline inicial foi aplicado antes das cinco migrações incrementais; em banco existente, execute primeiro a checagem de drift |
| Browser bloqueia a origem | Confira `ALLOWED_ORIGINS` na API e reinicie o servidor após alterar o ambiente |

## Publicação

O ambiente de demonstração usa a [Vercel](deploy-vercel.md). A configuração do [Render](deploy-render.md) é uma alternativa. Builds e instaladores devem ser distribuídos nas [Releases](https://github.com/VitorYunguiar/revive/releases), conforme o [guia de contribuição](../CONTRIBUTING.md).
