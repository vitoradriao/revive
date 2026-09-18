# Banco de dados

O REVIVE usa PostgreSQL no Supabase. A API acessa o banco com uma credencial de servidor; painel e aplicativo consomem a API.

## Estado do versionamento

As migrações deste diretório são incrementais e dependem das tabelas base já existentes. Não aplique a sequência esperando obter uma instalação completa em um banco vazio. A reprodução do esquema base é acompanhada na [Issue #6](https://github.com/VitorYunguiar/revive/issues/6).

| Migração | Objetivo |
| --- | --- |
| [20260616000000](migrations/20260616000000_add_goal_progress_baseline.sql) | Campos de referência para progresso das metas |
| [20260828223303](migrations/20260828223303_mobile_sessions_and_idempotency.sql) | Sessões mobile e registros de idempotência |
| [20260907002648](migrations/20260907002648_mobile_bootstrap_author.sql) | Autor opcional nas mensagens motivacionais do bootstrap |
| [20260907002650](migrations/20260907002650_restrict_revive_tables_to_api.sql) | Restrição de acesso às tabelas pela API |
| [20260907004754](migrations/20260907004754_harden_modification_trigger_search_path.sql) | Definição explícita do search_path de função de trigger |

## Configuração de um ambiente

1. Obtenha o esquema base revisado com a equipe, sem copiar dados reais de usuários.
2. Confira quais migrações já foram aplicadas e revise as restantes em ordem cronológica.
3. Valide as alterações em desenvolvimento antes de promover para outro ambiente.
4. Configure `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` somente na API, conforme o [guia de instalação](../docs/instalacao.md).

Consulte o [registro de validação do ambiente de desenvolvimento](../revive-mobile/docs/supabase-development-validation.md) como evidência histórica, não como indicação de que outros ambientes já receberam as mesmas alterações.
