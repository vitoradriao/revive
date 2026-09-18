# Publicação de desenvolvimento

> Registro histórico da publicação e das verificações de setembro de 2026. IDs, branches e resultados abaixo se referem à execução registrada. Para instalar a versão atual, consulte o [README mobile](../README.md); para o estado atual do código, consulte o GitHub Actions.

## API e painel

- URL: https://revive-beryl.vercel.app
- Base mobile: https://revive-beryl.vercel.app/api
- Hospedagem: projeto Vercel `revive`, ID `prj_AkmQVDVtFARtg04uHbIoxmdMn6IT`.
- Deployment final da API: `dpl_EBrpHe8NDF8NMfjwX8QyQjcdmEGv`, READY, publicado via CLI em 07/09/2026 UTC. Substitui `dpl_6w1hxmCDUYUJoAA3ntrq8EMfeZYS` após atualização compatível das dependências.
- Destino Vercel: production (domínio estável); banco Supabase continua sendo DESENVOLVIMENTO `upqlaeqdaobzrepamnvs`.
- Pacote de publicação revisado com `vercel deploy --dry`: código de API e painel, sem `.env`, documentos privados, mobile, runtime ou scripts de teste.
- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` cadastradas como segredos no servidor. `JWT_SECRET` remoto existente preservado. Segredos não foram copiados ao mobile.
- Código versionado no commit `fa91776` e enviado à branch `codex/publish-revive-development` no GitHub. A publicação foi feita pelo CLI. Antes de usar um deploy automático de `main`, integrar essa branch para não republicar a versão antiga.

## Validação executada

- `npm run validate` na raiz: 16 testes da API, 15 testes do painel e build Vite passaram.
- HTTP público: `/` = 200 HTML; `/api/health` = 200 JSON; `/api/v2/bootstrap` sem credencial = 401 JSON.
- `scripts/verify-mobile-development.cjs`, com `REVIVE_VERIFY_DEVELOPMENT=1` e `REVIVE_VERIFY_API_URL=https://revive-beryl.vercel.app`: seis grupos passaram pela internet, sem mocks.
- Cobertura real: cadastro/login de duas contas, bootstrap, isolamento, replay sequencial/conflito de idempotência, metas, recaídas, dispositivo push, refresh/reuso/logout e exclusão completa.
- Contas temporárias e dependências removidas e ausência verificada.
- Consulta de logs após publicação trouxe duas ocorrências de DeprecationWarning `url.parse()`; não foram encontrados erros funcionais nos testes públicos. Não equivale a monitoramento contínuo.
- Atualizações compatíveis via `npm audit fix` aplicadas e novamente testadas/publicadas. `npm audit --omit=dev` do backend: zero vulnerabilidades. Permanecem cinco advisories na cadeia de ferramentas Vite/Vitest/esbuild, exigindo migração de major; não foi usado `npm audit fix --force`.

## Mobile

- EAS: https://expo.dev/accounts/reviveapp/projects/revive-mobile
- Android package e iOS bundleIdentifier: `com.reviveapp.revive`.
- Perfil preview gera APK para instalação interna com a URL HTTPS acima.
- `.env.local` ignorado pelo Git configura a mesma URL para execução local.
- TypeScript, lint, 12 testes e as 21 verificações do Expo Doctor passaram após alinhar as dependências ao SDK 57.0.20.
- Build Android `2a7c9894-bfa6-4f2a-8a0b-a631a33c403c`: FINISHED em 07/09/2026 às 05:46:45 UTC, assinatura gerenciada pelo Expo. Estado confirmado em 08/09/2026. Arquivo enviado antes da remoção da declaração direta de `expo-modules-core`; a versão do módulo continua a mesma dependência do Expo.
- APK: https://expo.dev/artifacts/eas/mZSPfKgPRqC0dgrm5hFNJUZwZwVJEFyWKg6H-dHcHDQ.apk
- Detalhes do build: https://expo.dev/accounts/reviveapp/projects/revive-mobile/builds/2a7c9894-bfa6-4f2a-8a0b-a631a33c403c
- A pasta aninhada `revive/` contém outro projeto de exemplo e foi excluída da checagem de tipos, lint e do pacote EAS deste app.
- Ao usar EAS sem Git, definir `EAS_NO_VCS=1` e `EAS_PROJECT_ROOT=C:\revive-claude\revive-mobile` para empacotar apenas o aplicativo. `.easignore` exclui arquivos locais e chaves.
- Ainda não há validação em aparelho físico, publicação em lojas, nem garantia de atomicidade offline sob falhas/concorrência.
