# Deploy publico do REVIVE no Render

Este guia sobe API e painel em um unico servico publico. O painel React e buildado em `revive-painel/dist` e servido pelo Express no mesmo dominio da API.

## Por que Render

- Web service Node.js com URL publica `onrender.com`.
- Plano gratuito serve para teste, validacao e acesso temporario.
- Um unico servico evita configurar CORS entre frontend e backend.

## Antes de subir

Confirme que o repositorio remoto contem estes arquivos:

- `index.js`
- `package.json`
- `package-lock.json`
- `docs/deployment/render.example.yaml`
- `revive-painel/package.json`
- `revive-painel/package-lock.json`
- `revive-painel/src/**`
- `revive-painel/public/**`

Nao suba o arquivo `.env`. As variaveis sensiveis devem ser cadastradas direto no Render.

## Variaveis de ambiente

Cadastre no servico:

```ini
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=...
NODE_ENV=production
```

Use a mesma `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `JWT_SECRET` do `.env` local.
Se voce usar `SUPABASE_KEY`, ela precisa ser a service role key. A anon key pode falhar no cadastro quando a tabela `usuarios` estiver protegida por RLS.

`ALLOWED_ORIGINS` e opcional neste deploy, porque o painel e a API rodam no mesmo dominio. Se a API for consumida por outro frontend no futuro, cadastre:

```ini
ALLOWED_ORIGINS=https://SEU-SERVICO.onrender.com
```

## Deploy via Blueprint

1. Acesse o Render e conecte a conta do GitHub.
2. Crie um novo Blueprint usando o repositorio do REVIVE.
3. Copie o exemplo para render.yaml na raiz apenas se optar pelo Render. O Render vai detectar `docs/deployment/render.example.yaml`.
4. Preencha as variaveis marcadas como secret/sync false.
5. Inicie o deploy.

O build configurado e:

```bash
npm install && npm install --prefix revive-painel && npm run build --prefix revive-painel
```

O start configurado e:

```bash
npm start
```

O health check configurado e:

```text
/api/health
```

## Validacao

Depois que o deploy concluir:

- Abra `https://SEU-SERVICO.onrender.com`.
- Teste cadastro/login.
- Abra `https://SEU-SERVICO.onrender.com/api/health`.
- Opcional: abra `https://SEU-SERVICO.onrender.com/api/docs`.

## Manter publico por um mes

O servico continua publico enquanto estiver ativo no Render. No plano gratuito, pode haver cold start apos periodo sem acesso. Para reduzir chance de pausa por inatividade durante apresentacao, acesse a URL antes de demonstrar.
