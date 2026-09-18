# Estado da implementação

## Entregue no repositório

- Fundação Expo SDK 57, React Native, TypeScript estrito e Expo Router.
- Login e cadastro v2, access token curto em memória, refresh token no SecureStore, rotação, revogação e detecção de reutilização.
- Bootstrap consolidado e dashboard.
- Cadastro, detalhe e exclusão confirmada de hábitos.
- Check-in, registro diário e recaída com timestamp/fuso.
- Criação, conclusão e exclusão de metas.
- Snapshot SQLite por usuário, fila offline e backoff. A idempotência do servidor ainda precisa de atomicidade antes do beta (ver pendências abaixo).
- Restauração offline preservando sessão em falhas de rede e refresh concorrente único.
- Calendário, conquistas e tela de recuperação de falhas de sincronização.
- Indicadores, exportação CSV/JSON e relatório imprimível.
- Lembrete local, canal Android e deep link validado por allowlist.
- Exclusão transacional de conta e base de registro de dispositivos para push.
- Contratos OpenAPI, testes mobile/API, fluxo Maestro inicial e checklist de release.

## Depende de ambiente ou decisão externa

- Migrations de metas, sessões e autor aplicadas no desenvolvimento `upqlaeqdaobzrepamnvs`; demais ambientes pendentes.
- Chave de servidor validada no backend local e restrição das tabelas aplicada no desenvolvimento. Configurar essa chave também no servidor de cada ambiente antes de promover as migrations.
- Identificadores Android/iOS configurados como `com.reviveapp.revive`; API de desenvolvimento publicada em `https://revive-beryl.vercel.app/api`. Proprietário Expo/EAS: `reviveapp`.
- APK Android preview gerado no EAS (build `2a7c9894-bfa6-4f2a-8a0b-a631a33c403c`, FINISHED). Executar testes em aparelho real; build e testes iOS ainda pendentes.
- Publicar a página web de solicitação de exclusão e a política de privacidade.
- Configurar FCM/APNs, projeto EAS e um worker de envio/receipts antes de habilitar push remoto.

## Próximas histórias de produto

- Tornar atômicos a mutação de negócio e o armazenamento da resposta idempotente no backend. A reserva atual pode ser removida após gravação parcial; não considerar a garantia de envio único concluída.
- Persistir a intenção antes do primeiro envio online e testar encerramento do processo durante envio.
- Revisar revogação de access tokens, concorrência de rotação e troca de conta durante sincronização.
- Biblioteca editorial de dicas com revisão de conteúdo.
- Sincronização incremental por `updated_at`.
- Testes E2E autenticados e suíte de modo avião em aparelho.
- Bloqueio biométrico opcional e telemetria redigida.

## Verificação local e bloqueios de distribuição

- Testes automatizados usam mocks; não equivalem a validação no banco ou em dispositivo.
- SQL remoto aplicado no desenvolvimento em 06/09/2026 (07/09 UTC). API e painel publicados na Vercel e validados por HTTPS; APK Android gerado e disponível para instalação interna. Evidências em `supabase-development-validation.md` e `deployment-validation.md`.

## Acompanhamento das pendências

- [Validação Android em aparelho](https://github.com/VitorYunguiar/revive/issues/7).
- [Atomicidade da sincronização](https://github.com/VitorYunguiar/revive/issues/8).
- [Esquema base do banco](https://github.com/VitorYunguiar/revive/issues/6).

Os registros de publicação citados acima são evidências datadas. Para a validação automatizada atual, consulte o [GitHub Actions](https://github.com/VitorYunguiar/revive/actions/workflows/tests.yml).
