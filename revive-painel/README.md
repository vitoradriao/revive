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

O navegador usa `/api` no mesmo domínio do painel em todos os ambientes. Em desenvolvimento, o proxy Vite encaminha para `http://127.0.0.1:3000`; copie [`.env.example`](.env.example) para `.env.local` para definir `REVIVE_API_PROXY_TARGET` com outro destino, sem o sufixo `/api`, e reinicie o Vite. `VITE_API_URL` não é mais utilizado.

As [sessões web v2](../docs/web-sessions.md) exigem as migrations e `WEB_AUTH_ENABLED=true` na API, além de HTTPS (ou localhost) e suporte a Web Locks/BroadcastChannel no navegador. O refresh fica em cookie HttpOnly e o access token somente em memória. Sessões legadas exigem novo login. Não inclua chaves privilegiadas do Supabase nem segredos JWT no frontend.

## Verificações

```bash
npm test
npm run lint
npm run build
```

`npm test` executa os testes unitários e de integração. O build é gerado em `dist/`. Para validar API, painel e build juntos, execute `npm run validate` na raiz do repositório.

## Contribuição

Siga o [fluxo de Issues, branches e Pull Requests](../CONTRIBUTING.md). As instruções de hospedagem estão no [guia da Vercel](../docs/deploy-vercel.md).
