# REVIVE — Painel web

Interface web responsiva do REVIVE, desenvolvida com React, Vite e Tailwind CSS. O painel consome a API Express para autenticação, acompanhamento de hábitos, registros diários, metas e relatórios.

## Desenvolvimento

Configure e inicie a API conforme o [README principal](../README.md). Depois, nesta pasta:

```bash
npm ci
npm run dev
```

Abra o endereço exibido pelo Vite, normalmente `http://localhost:5173`.

## Endereço da API

A configuração fica em `src/config/env.js`:

- Desenvolvimento: porta `3000` no mesmo host utilizado pelo navegador.
- Produção: `/api` no mesmo domínio do painel.
- Endereço personalizado: defina `VITE_API_URL` em `.env.local`, por exemplo `VITE_API_URL=http://localhost:3000/api`, e reinicie o Vite.

Variáveis `VITE_*` são públicas no navegador. Não inclua chaves privilegiadas do Supabase nem segredos JWT.

## Verificações

```bash
npm test
npm run lint
npm run build
```

`npm test` executa os testes unitários e de integração. O build é gerado em `dist/`. Para validar API, painel e build juntos, execute `npm run validate` na raiz do repositório.

## Contribuição

Siga o [fluxo de Issues, branches e Pull Requests](../CONTRIBUTING.md). As instruções de hospedagem estão no [guia da Vercel](../docs/deploy-vercel.md).
