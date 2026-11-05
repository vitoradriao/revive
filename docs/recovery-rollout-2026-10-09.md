# Rollout de recuperação e hábitos — 09/10/2026

Ambiente: Supabase de desenvolvimento `upqlaeqdaobzrepamnvs` e API/painel em [revive-beryl.vercel.app](https://revive-beryl.vercel.app). O destino Vercel chama-se Production e atende o domínio estável; isso não altera a classificação do banco como desenvolvimento. As operações continuaram após 00:00 UTC de 10/10, ainda em 09/10 no horário de São Paulo.

Código implantado: main [`440b23a`](https://github.com/vitoradriao/revive/commit/440b23acca49c07b90ba6863d7f46bd169c9b7e1), com os PRs [#45](https://github.com/vitoradriao/revive/pull/45) e [#46](https://github.com/vitoradriao/revive/pull/46). [CI da main aprovada](https://github.com/vitoradriao/revive/actions/runs/37996655970).

## Backup, ensaio e banco remoto

- A checagem inicial confirmou exatamente 12 versões e a ausência de `usuarios.credential_version` e `vicios.revision`. `assert_base_schema.sql` passou; não foram reaplicados baseline, replay histórico ou fixtures no remoto.
- Foi capturado um snapshot lógico consistente, em transação READ ONLY / REPEATABLE READ, das 15 tabelas de aplicação em `public` e do histórico `supabase_migrations.schema_migrations`: 202 registros, incluindo 12 entradas de migration. O snapshot inclui catálogo de colunas, constraints, índices, funções, triggers, RLS e permissões. Seu escopo não inclui Supabase Auth ou Storage, que não foram alterados.
- O arquivo foi guardado fora do Git, com acesso restrito ao usuário/SYSTEM. A restauração PostgreSQL 17.6 isolada reproduziu dados e catálogo, incluindo as definições/permissões reais das funções. A comparação integral e as referências estrangeiras passaram.
- As duas migrations foram ensaiadas nessa cópia restaurada. Rollback retornou às 12 versões; a aplicação conjunta chegou a 14, sem mudar registros existentes. O ensaio remoto confirmou `REHEARSAL_ROLLED_BACK`, 12 versões e ausência da coluna de credenciais.
- Foram aplicadas apenas `20261006130000_password_recovery.sql` e `20261009120000_habit_edit_archive.sql`, numa transação com limites de lock/execução, registro do SQL no histórico e `NOTIFY pgrst`. O recibo remoto confirmou `ROLLOUT_APPLIED` e 14 versões.
- `assert_full_schema.sql` e o relatório de catálogo passaram no remoto. A comparação de contagem/hash dos registros originais confirmou preservação nas 15 tabelas de aplicação; novos campos têm defaults de versão de credenciais zero e revisão de hábito um.

## Vercel e entrega externa

- As seis variáveis SMTP e `PASSWORD_RECOVERY_ENABLED` foram cadastradas como segredos somente em Production. Foram enviados apenas os valores da integração dedicada de envio; as credenciais Google e o `.env` completo não foram enviados ao Vercel.
- A primeira republicação manteve a recuperação desativada: [deployment FDwoQFZt2PWNsBzMv4gbE1FfmEoK](https://vercel.com/vitoryunguiars-projects/revive/FDwoQFZt2PWNsBzMv4gbE1FfmEoK).
- Cadastro/login web e mobile anteriores à migration continuaram funcionando depois dela. O refresh anterior foi aceito e rotacionado; o hábito sintético preservou sua identidade/histórico.
- A suíte `scripts/verify-mobile-development.cjs` passou em seis grupos pela API HTTPS publicada: cadastro/login, bootstrap/isolamento, idempotência/conflito, metas/recaída, dispositivos/refresh/reuso/logout e exclusão/limpeza. As duas contas descartáveis foram removidas.
- A recuperação foi habilitada e republicada: [deployment 8EoERZku4rwkCyY1d72CFrDz3VGK](https://vercel.com/vitoryunguiars-projects/revive/8EoERZku4rwkCyY1d72CFrDz3VGK), Ready. O envio solicitado pela API publicada chegou ao Inbox do Gmail externo e a solicitação permaneceu válida no banco, sem invalidação por falha/timeout SMTP.

## Limites deste aceite

O formulário Android da versão atual está em homologação física; o resultado será registrado após o teste. O áudio TalkBack destas telas e iOS ainda não foram validados nesta execução. A [issue #7](https://github.com/vitoradriao/revive/issues/7) continua aberta como gate do conjunto, incluindo as funcionalidades #22, #25, #26 e #27 e os requisitos de distribuição. Nenhuma publicação em loja foi feita.

Westmail continua dependendo da disponibilidade do PC, Docker, Tailscale e internet. Em falha operacional, desabilitar a recuperação mantendo a API que verifica `cv`; não voltar a uma API anterior que aceite tokens revogados. [Contrato e recuperação operacional](password-recovery.md).
