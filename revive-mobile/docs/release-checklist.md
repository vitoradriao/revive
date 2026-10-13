# Checklist de release

## Antes do primeiro build interno

- Definir `android.package`, `ios.bundleIdentifier` e proprietário do projeto EAS.
- Configurar `EXPO_PUBLIC_API_URL` HTTPS nos ambientes preview e production.
- Aplicar e revisar a migration `20260828223303_mobile_sessions_and_idempotency.sql` no Supabase de desenvolvimento.
- Confirmar que a API roda em Node.js 22 e possui `JWT_SECRET` e chave privilegiada somente no servidor.
- Validar login de conta existente, refresh, logout e bootstrap em aparelho Android real.

## Gate técnico

- `npm run validate` no diretório mobile.
- `npm run test:api` na raiz.
- `npx expo-doctor` sem incompatibilidades bloqueantes.
- Teste de isolamento com duas contas.
- Executar o [roteiro de lembretes locais](local-reminders-validation.md): entrega, mudança de fuso, cold start, bloqueio local, autorização revogada e cancelamento/troca de conta em Android real.
- Modo avião: criar check-in, recaída e meta; reiniciar; reconectar; confirmar uma única gravação.
- Vontades: consultar a [matriz física Android](urge-events-android-validation.md), completar TalkBack auditivo/upgrade/corridas e resolver a [falha de configuração #50](https://github.com/vitoradriao/revive/issues/50). O aceite funcional da #25 não encerra o gate #7.
- Busca por segredos no bundle/config de build.
- Cleartext desabilitado em production.

## Loja

- Política de privacidade e URL de suporte/exclusão públicas.
- Textos de permissão e notificações sem conteúdo sensível.
- Aviso de que o Revive não substitui atendimento profissional.
- Capturas, classificação etária, formulário de segurança de dados e revisão de acessibilidade.
