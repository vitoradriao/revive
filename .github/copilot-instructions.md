# Convenções do repositório REVIVE

## Organização

- `index.js`: API Express, rotas web, autorização e acesso ao Supabase.
- `mobile-api.js`: sessões, bootstrap e operações da API v2.
- `revive-painel/src`: painel React com rotas, contextos, serviços e componentes.
- `revive-mobile/app` e `revive-mobile/src`: telas Expo Router e módulos do aplicativo.
- `supabase/migrations`: alterações incrementais do banco.

## Antes de alterar

Consulte o README do componente, `CONTRIBUTING.md` e os guias relacionados em `docs/README.md`. Registre o escopo em uma Issue e trabalhe em uma branch própria. Preserve mudanças locais que não pertençam à tarefa.

## Implementação

- Mantenha textos da interface em português e preserve os contratos existentes da API.
- No painel, use os serviços em `revive-painel/src/services` e a configuração de URL em `src/config/env.js`.
- No mobile, use os módulos de `src/core/api` e preserve o isolamento de dados por usuário.
- Não coloque segredos, tokens reais ou chaves privilegiadas em clientes, logs ou arquivos versionados.
- Não altere arquivos nativos gerados do mobile como fonte de configuração permanente; use `app.config.ts`, plugins e scripts versionados.

## Verificação

- API/painel: `npm run validate` na raiz.
- Mobile: `npm run validate --prefix revive-mobile`.
- Documentação: `npm run check:docs` após adicionar os arquivos novos ao índice do Git.
- Relate no PR o que foi efetivamente testado e os limites da validação.

O roteiro atual de arquitetura está em `docs/arquitetura-fluxograma.md`. Os documentos de `docs/academico/fase-02` são versões históricas e não devem orientar uma alteração sem confronto com o código atual.
