# Banco de dados

O REVIVE usa PostgreSQL no Supabase. A API Express acessa as tabelas privadas com `SUPABASE_SERVICE_ROLE_KEY`; painel e aplicativo usam somente a API e seus JWTs próprios. A [migração inicial](migrations/20260615000000_initial_schema.sql) reproduz as sete tabelas legadas, incluindo `marcos`, a partir de metadados do projeto de desenvolvimento, sem exportar linhas de usuários.

## Migrações

| Ordem | Migração | Objetivo |
| --- | --- | --- |
| 1 | [20260615000000](migrations/20260615000000_initial_schema.sql) | Tabelas base, chaves, índices, trigger e acesso privado |
| 2 | [20260616000000](migrations/20260616000000_add_goal_progress_baseline.sql) | Referências de progresso das metas |
| 3 | [20260828223303](migrations/20260828223303_mobile_sessions_and_idempotency.sql) | Sessões, idempotência, tokens de push e exclusão de conta |
| 4 | [20260907002648](migrations/20260907002648_mobile_bootstrap_author.sql) | Autor opcional das mensagens |
| 5 | [20260907002650](migrations/20260907002650_restrict_revive_tables_to_api.sql) | Restrição de acesso à API |
| 6 | [20260907004754](migrations/20260907004754_harden_modification_trigger_search_path.sql) | `search_path` explícito da função de trigger |
| 7 | [20260923163030](migrations/20260923163030_restrict_modification_trigger_execute.sql) | Revogação de `EXECUTE` direto para os papéis cliente |
| 8 | [20260923164304](migrations/20260923164304_verify_baseline_replay.sql) | Replay verificável em dois esquemas isolados, removidos ao final |

Não renumere migrations já aplicadas. Os identificadores das cinco migrations antigas no projeto de desenvolvimento são diferentes dos nomes versionados neste repositório; compare o histórico antes de reparar qualquer versão. O baseline só deve executar em banco vazio.

## Instalação em banco vazio

É preciso PostgreSQL 17 ou Supabase, `psql` 17 para a verificação e, para gerenciar o histórico Supabase, a [CLI do Supabase](https://supabase.com/docs/guides/local-development/cli/getting-started). Em um projeto Supabase novo e vazio, na raiz do monorepositório, inicialize a configuração CLI se ainda não existir, vincule o projeto correto e confira a proposta antes de aplicar:

```powershell
supabase init
supabase login
supabase link --project-ref <referencia-do-projeto-vazio>
supabase db push --dry-run
supabase db push
```

`supabase init` só é necessário uma vez. A CLI aplica as migrations em ordem e mantém o histórico de versões. Não use `db reset --linked` em um ambiente com dados.

Para testar a cadeia sem instalar um servidor local, crie dois **bancos descartáveis** em ambiente isolado, um para instalação limpa e outro para upgrade sintético. Use os papéis Supabase `anon`, `authenticated` e `service_role`. Configure `PGHOST`, `PGPORT`, `PGUSER`, `PGDATABASE` (nome terminando em `_revive_fixture`) e autenticação do `psql` por `PGPASSFILE` ou método equivalente fora do repositório. Na raiz do monorepositório, execute no PowerShell:

```powershell
./supabase/verification/run_disposable.ps1 -Mode Fresh
```

O script recusa um alvo que já tenha tabelas REVIVE e executa o baseline, as seis migrations funcionais, o replay isolado e as [verificações de esquema](verification/assert_base_schema.sql) e [segurança](verification/assert_full_schema.sql). Aponte a API de teste a esse banco com credencial de servidor temporária e execute cadastro, bootstrap, registros, metas, recaídas e exclusão de conta conforme o [guia de testes](../docs/testes.md). Não configure o painel nem o mobile com a credencial de servidor.

## Atualização de banco legado

1. Faça backup recuperável do banco e confirme a restauração em um ambiente isolado. Mantenha backup, senhas e conteúdo de usuários fora do Git. Registre as versões com `supabase migration list` e faça uma cópia do esquema com `pg_dump --schema-only`, armazenada fora do repositório.
2. Execute [`assert_base_schema.sql`](verification/assert_base_schema.sql) contra o banco existente com `psql -X --set=ON_ERROR_STOP=1 --file=<arquivo>`, usando variáveis `PG*` e autenticação fora do repositório. São consultas ao catálogo, sem leitura de registros. Se falhar, interrompa a adoção e corrija a divergência em uma migration revisada; não use `CREATE IF NOT EXISTS` como prova de equivalência.
3. Vincule a CLI ao projeto existente com `supabase login` e `supabase link --project-ref <referencia-do-projeto>`. Reconcilie o histórico Supabase apenas **depois** da verificação. Marque o baseline `20260615000000` como aplicado com `supabase migration repair 20260615000000 --status applied`. Se as cinco migrations antigas tiverem versões remotas diferentes, reconcilie a correspondência uma a uma no histórico, preservando os arquivos versionados e conferindo o SQL de cada versão. Nunca aplique o baseline DDL sobre tabelas existentes. Confira a proposta de `supabase db push --dry-run`, aplique apenas as migrations novas ainda ausentes e execute [`assert_full_schema.sql`](verification/assert_full_schema.sql).
4. Verifique índices, constraints, RLS e grants com [`catalog_report.sql`](verification/catalog_report.sql). Só promova alterações após testar backup e recuperação no ambiente de homologação.

O teste de upgrade usa o mesmo esquema legado reconstruído e linhas inteiramente fictícias. Em outro banco descartável vazio, configure as variáveis `PG*` acima e execute:

```powershell
./supabase/verification/run_disposable.ps1 -Mode Legacy
```

O script insere a [fixture legada](verification/legacy_fixture.sql) entre o baseline e as migrations. A [checagem após upgrade](verification/assert_synthetic_upgrade.sql) valida identificadores, relações, defaults e a cascata de exclusão de conta dentro de uma transação revertida. Ele nunca toca no projeto existente. O replay versionado também executa esses dois cenários em esquemas isolados no PostgreSQL conectado e remove os esquemas ao final; a execução de 23/09/2026 passou no projeto `REVIVE V2` sem alterar a contagem das tabelas de aplicação.

## Recuperação

Se a verificação anterior à adoção apontar drift, nenhuma migration nem reparo do histórico deve ser executado. Se uma migration falhar num ambiente de teste, preserve o erro e restaure o snapshot em banco isolado, corrija a migration e repita as duas rotas de validação. Em ambiente com dados, coordene a janela de manutenção e restaure o backup validado se a alteração não puder ser revertida com segurança; não apague linhas para forçar a migração. Consulte o [fluxo oficial da CLI](https://supabase.com/docs/guides/local-development/cli-workflows) e o [comando de reparo do histórico](https://supabase.com/docs/reference/cli/supabase-migration-repair).

O [registro histórico de validação do desenvolvimento](../revive-mobile/docs/supabase-development-validation.md) não substitui a checagem do ambiente atual.
