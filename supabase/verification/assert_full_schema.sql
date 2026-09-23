-- Run after all versioned migrations, together with assert_base_schema.sql.
-- Reads PostgreSQL catalog metadata only; no application rows are returned.
do $$
declare
  expected record;
  relation_oid oid;
  actual_type text;
  actual_not_null boolean;
  privilege_name text;
begin
  for expected in
    select * from (values
      ('metas','iniciar_hoje','boolean',true),
      ('metas','data_inicio_meta','date',false),
      ('metas','dias_abstinencia_inicio','integer',true),
      ('metas','valor_economizado_inicio','numeric(12,2)',true),
      ('mensagens_motivacionais','autor','text',false),
      ('app_sessions','usuario_id','uuid',true),
      ('app_sessions','refresh_token_hash','text',true),
      ('app_sessions','family_id','uuid',true),
      ('app_sessions','expires_at','timestamp with time zone',true),
      ('app_sessions','replaced_by','uuid',false),
      ('api_idempotency','usuario_id','uuid',true),
      ('api_idempotency','idempotency_key','uuid',true),
      ('api_idempotency','request_hash','text',true),
      ('api_idempotency','status_code','integer',false),
      ('api_idempotency','response_body','jsonb',false),
      ('device_push_tokens','usuario_id','uuid',true),
      ('device_push_tokens','expo_push_token','text',true),
      ('device_push_tokens','platform','text',true),
      ('device_push_tokens','enabled','boolean',true)
    ) as specification(table_name, column_name, data_type, required)
  loop
    actual_type := null;
    actual_not_null := null;
    select format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull
      into actual_type, actual_not_null
      from pg_attribute attribute
      where attribute.attrelid = to_regclass(format('public.%I', expected.table_name))
        and attribute.attname = expected.column_name
        and attribute.attnum > 0 and not attribute.attisdropped;
    if actual_type is distinct from expected.data_type
       or actual_not_null is distinct from expected.required then
      raise exception 'Schema drift in %.%: expected % not_null=%, found % not_null=%',
        expected.table_name, expected.column_name, expected.data_type,
        expected.required, coalesce(actual_type, '<missing>'), actual_not_null;
    end if;
  end loop;

  for expected in
    select * from (values
      ('usuarios'), ('vicios'), ('registros_diarios'),
      ('historico_recaidas'), ('metas'), ('mensagens_motivacionais'),
      ('marcos'), ('app_sessions'), ('api_idempotency'),
      ('device_push_tokens')
    ) as tables(table_name)
  loop
    relation_oid := to_regclass(format('public.%I', expected.table_name));
    if relation_oid is null then
      raise exception 'Schema drift: missing table public.%', expected.table_name;
    end if;
    if not (select relrowsecurity from pg_class where oid = relation_oid) then
      raise exception 'Security drift: RLS disabled on public.%', expected.table_name;
    end if;
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if has_table_privilege('anon', relation_oid, privilege_name)
         or has_table_privilege('authenticated', relation_oid, privilege_name) then
        raise exception 'Security drift: client role has % on public.%',
          privilege_name, expected.table_name;
      end if;
      if not has_table_privilege('service_role', relation_oid, privilege_name) then
        raise exception 'Security drift: service_role lacks % on public.%',
          privilege_name, expected.table_name;
      end if;
    end loop;
  end loop;

  for expected in
    select * from (values
      ('app_sessions','usuario_id','usuarios','c'),
      ('app_sessions','replaced_by','app_sessions','n'),
      ('api_idempotency','usuario_id','usuarios','c'),
      ('device_push_tokens','usuario_id','usuarios','c')
    ) as foreign_keys(table_name, column_name, referenced_table, delete_action)
  loop
    if not exists (
      select 1 from pg_constraint constraint_record
      join pg_attribute attribute on attribute.attrelid = constraint_record.conrelid
        and attribute.attname = expected.column_name
      where constraint_record.conrelid = to_regclass(format('public.%I', expected.table_name))
        and constraint_record.contype = 'f'
        and constraint_record.conkey = array[attribute.attnum]::smallint[]
        and constraint_record.confrelid = to_regclass(format('public.%I', expected.referenced_table))
        and constraint_record.confdeltype = expected.delete_action
    ) then
      raise exception 'Schema drift in %.%: missing FK to % with delete action %',
        expected.table_name, expected.column_name,
        expected.referenced_table, expected.delete_action;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.api_idempotency'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (usuario_id, idempotency_key)'
  ) then
    raise exception 'Schema drift: missing composite idempotency primary key';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_sessions'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (refresh_token_hash)'
  ) then
    raise exception 'Schema drift: missing refresh token hash uniqueness';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.device_push_tokens'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (expo_push_token)'
  ) then
    raise exception 'Schema drift: missing push token uniqueness';
  end if;

  if to_regprocedure('public.delete_revive_account(uuid)') is null then
    raise exception 'Schema drift: missing delete_revive_account(uuid)';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = 'public.delete_revive_account(uuid)'::regprocedure
      and not prosecdef
      and proconfig @> array['search_path=' || chr(34) || chr(34)]
  ) then
    raise exception 'Security drift: account deletion must be SECURITY INVOKER with empty search_path';
  end if;
  if not has_function_privilege(
      'service_role', 'public.delete_revive_account(uuid)', 'EXECUTE')
     or has_function_privilege(
      'anon', 'public.delete_revive_account(uuid)', 'EXECUTE')
     or has_function_privilege(
      'authenticated', 'public.delete_revive_account(uuid)', 'EXECUTE') then
    raise exception 'Security drift: incorrect account deletion EXECUTE grants';
  end if;
  if has_function_privilege('anon',
       'public.atualizar_data_modificacao()', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.atualizar_data_modificacao()', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.atualizar_data_modificacao()', 'EXECUTE') then
    raise exception 'Security drift: incorrect modification trigger EXECUTE grants';
  end if;

  raise notice 'Full schema, cascades, RLS and grants verified; no data was read';
end;
$$;
