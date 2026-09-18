# REVIVE

Plataforma de apoio à recuperação de vícios, com API REST, painel web responsivo e aplicativo mobile. Permite acompanhar hábitos, registros diários, recaídas, metas e indicadores de progresso.

## Componentes

| Componente | Tecnologias | Diretório |
| --- | --- | --- |
| API | Node.js, Express e Supabase | Raiz do repositório |
| Painel web | React, Vite e Tailwind CSS | `revive-painel/` |
| Aplicativo mobile | React Native e Expo | `revive-mobile/` |

O painel e o aplicativo acessam os dados pela API. As credenciais privilegiadas do Supabase ficam somente no servidor.

## Pré-requisitos

- Node.js 22 ou superior e npm.
- Git para clonar o repositório.
- Projeto Supabase configurado com o banco utilizado pela API.

O instalador Windows x64 do Node.js 22.20.0 está disponível na [Release de ferramentas](https://github.com/VitorYunguiar/revive/releases/tag/tools-node-v22.20.0), com origem e checksum para conferência. Outras versões e sistemas estão disponíveis no [site oficial do Node.js](https://nodejs.org/en/download). Instaladores e builds devem ser anexados às Releases, sem entrar nos commits do código-fonte.

## Estrutura

```text
revive/
├── index.js              # API Express
├── mobile-api.js         # Rotas e serviços da API mobile
├── .env.example          # Modelo de configuração da API
├── revive-painel/        # Painel web
├── revive-mobile/        # Aplicativo Expo/React Native
├── supabase/migrations/  # Migrações do banco
├── tests/                # Testes da API
└── docs/                 # Documentação técnica
```

## Executar a API

Clone o projeto e instale as dependências:

```bash
git clone https://github.com/VitorYunguiar/revive.git
cd revive
npm ci
```

Copie `.env.example` para `.env` na raiz e preencha:

| Variável | Uso |
| --- | --- |
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave privilegiada usada exclusivamente pela API |
| `JWT_SECRET` | Segredo de assinatura dos tokens; use um valor aleatório e privado |
| `PORT` | Porta da API; padrão `3000` |
| `NODE_ENV` | `development` localmente; `production` na hospedagem |
| `ALLOWED_ORIGINS` | Opcional: origens permitidas, separadas por vírgula |

`SUPABASE_KEY` é um fallback opcional se `SUPABASE_SERVICE_ROLE_KEY` não estiver definida. Não publique `.env` nem coloque essas chaves no painel ou no aplicativo.

```bash
npm run dev
```

- API local: `http://localhost:3000/api`
- Verificação de disponibilidade: `http://localhost:3000/api/health`
- Documentação das rotas: `http://localhost:3000/api/docs`

Para executar sem recarga automática, use `npm start`.

## Banco de dados

A API depende das tabelas `usuarios`, `vicios`, `registros_diarios`, `historico_recaidas`, `metas` e `mensagens_motivacionais`. As migrações em [`supabase/migrations`](supabase/migrations) incluem alterações de metas, sessões mobile, idempotência e permissões.

As migrações versionadas pressupõem a existência do esquema base: não constituem, sozinhas, uma instalação completa em banco vazio. Antes de configurar um novo ambiente, obtenha o esquema base com a equipe e revise as migrações em ordem cronológica.

## Executar o painel web

Em outro terminal, na raiz do repositório:

```bash
npm ci --prefix revive-painel
npm run dev --prefix revive-painel
```

Abra a URL informada pelo Vite, normalmente `http://localhost:5173`. Localmente, o painel usa a API na porta `3000`; em produção, usa `/api` no mesmo domínio. Para outro endereço, defina `VITE_API_URL` em `revive-painel/.env.local`, incluindo o sufixo `/api`, e reinicie o Vite.

Após instalar as dependências da API e do painel, `npm run dev:stack` inicia os dois serviços em conjunto.

## Executar o aplicativo mobile

Consulte o [guia do aplicativo](revive-mobile/README.md) para configurar a URL da API, executar com Expo e baixar o APK de teste. A [documentação Android](revive-mobile/docs/android-local.md) descreve o uso do Android Studio e a geração local de APK.

## Testes e build

Na raiz, com as dependências da API e do painel instaladas:

```bash
npm run validate
```

O comando executa os testes da API, os testes do painel e o build web. A validação do mobile é separada:

```bash
npm ci --prefix revive-mobile
npm run validate --prefix revive-mobile
```

| Comando na raiz | Finalidade |
| --- | --- |
| `npm run test:api` | Testes unitários e de integração da API |
| `npm run test:web` | Testes unitários e de integração do painel |
| `npm run build:web` | Build de produção do painel |
| `npm run lint:web` | Análise estática do painel |

Mais detalhes no [guia de testes](docs/testes.md).

## Contribuição e documentação

Registre a tarefa em uma Issue, desenvolva em uma branch e abra um Pull Request com as verificações realizadas. Consulte o [guia de contribuição](CONTRIBUTING.md).

- [Publicação na Vercel](docs/deploy-vercel.md)
- [Arquitetura](docs/arquitetura-fluxograma.md)
- [Convenções de código](docs/coding-conventions.md)
- [Contrato da API mobile](revive-mobile/docs/api-contracts.md)
