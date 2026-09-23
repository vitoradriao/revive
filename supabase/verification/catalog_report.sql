-- Catalog-only evidence. Safe to attach to a PR; returns no user content.
select c.relname as table_name, c.relrowsecurity as rls_enabled,
       has_table_privilege('anon', c.oid, 'SELECT') as anon_select,
       has_table_privilege('authenticated', c.oid, 'SELECT') as authenticated_select,
       has_table_privilege('service_role', c.oid, 'SELECT') as service_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'usuarios', 'vicios', 'registros_diarios', 'historico_recaidas',
    'metas', 'mensagens_motivacionais', 'marcos',
    'app_sessions', 'api_idempotency', 'device_push_tokens'
  )
order by c.relname;

select conrelid::regclass as table_name, contype as constraint_type,
       pg_get_constraintdef(oid) as definition
from pg_constraint
where connamespace = 'public'::regnamespace
  and contype in ('p','u','f','c')
order by conrelid::regclass::text, contype, conname;

select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'usuarios', 'vicios', 'registros_diarios', 'historico_recaidas',
    'metas', 'mensagens_motivacionais', 'marcos',
    'app_sessions', 'api_idempotency', 'device_push_tokens'
  )
order by tablename, indexname;

select proname, prosecdef as security_definer, proconfig,
       has_function_privilege('anon', oid, 'EXECUTE') as anon_execute,
       has_function_privilege('authenticated', oid, 'EXECUTE') as authenticated_execute,
       has_function_privilege('service_role', oid, 'EXECUTE') as service_execute
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('atualizar_data_modificacao', 'delete_revive_account')
order by proname;
