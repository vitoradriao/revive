-- Run after all versioned migrations, together with assert_base_schema.sql.
-- Reads PostgreSQL catalog metadata only; no application rows are returned.
do $$
declare
  expected record;
  relation_oid oid;
  actual_type text;
  actual_not_null boolean;
  privilege_name text;
  index_name text;
begin
  for expected in
    select * from (values
      ('usuarios','credential_version','bigint',true),
      ('password_recovery_requests','usuario_id','uuid',true),
      ('password_recovery_requests','code_hash','text',true),
      ('password_recovery_requests','attempts','smallint',true),
      ('password_recovery_requests','expires_at','timestamp with time zone',true),
      ('vicios','revision','integer',true),
      ('vicios','motivo_pessoal','text',false),
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
      ('device_push_tokens','enabled','boolean',true),
      ('historico_recaidas','resetar_contador','boolean',false),
      ('progresso_ancoras','vicio_id','uuid',true),
      ('progresso_ancoras','started_at','timestamp with time zone',true),
      ('progresso_ancoras','cobertura','text',true),
      ('progresso_periodos','vicio_id','uuid',true),
      ('progresso_periodos','started_at','timestamp with time zone',true),
      ('progresso_periodos','ended_at','timestamp with time zone',false),
      ('progresso_periodos','source_relapse_id','uuid',false),
      ('segmentos_economia','effective_from','timestamp with time zone',true),
      ('segmentos_economia','effective_to','timestamp with time zone',false),
      ('segmentos_economia','valor_diario','numeric(10,2)',false),
      ('segmentos_economia','cobertura','text',true),
      ('conquistas_permanentes','usuario_id','uuid',true),
      ('conquistas_permanentes','vicio_id','uuid',false),
      ('conquistas_permanentes','categoria','text',true),
      ('conquistas_permanentes','valor_alvo','numeric(12,2)',true),
      ('conquistas_permanentes','awarded_at','timestamp with time zone',true),
      ('conquistas_permanentes','origem','text',true),
      ('conquistas_permanentes','cobertura','text',true),
      ('eventos_vontade','usuario_id','uuid',true),
      ('eventos_vontade','vicio_id','uuid',true),
      ('eventos_vontade','occurred_at','timestamp with time zone',true),
      ('eventos_vontade','timezone','text',true),
      ('eventos_vontade','intensidade','smallint',true),
      ('eventos_vontade','gatilhos','text[]',true),
      ('eventos_vontade','nota','text',false),
      ('eventos_vontade','acao_realizada','text',false),
      ('eventos_vontade','resultado','text',false),
      ('eventos_vontade','created_at','timestamp with time zone',true),
      ('eventos_vontade','updated_at','timestamp with time zone',true)
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
      ('usuarios'), ('password_recovery_requests'), ('password_recovery_limits'), ('vicios'), ('registros_diarios'),
      ('historico_recaidas'), ('metas'), ('mensagens_motivacionais'),
      ('marcos'), ('app_sessions'), ('api_idempotency'),
      ('device_push_tokens'), ('progresso_ancoras'), ('progresso_periodos'),
      ('segmentos_economia'), ('conquistas_permanentes'), ('eventos_vontade')
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
      ('password_recovery_requests','usuario_id','usuarios','c'),
      ('app_sessions','usuario_id','usuarios','c'),
      ('app_sessions','replaced_by','app_sessions','n'),
      ('api_idempotency','usuario_id','usuarios','c'),
      ('device_push_tokens','usuario_id','usuarios','c'),
      ('progresso_ancoras','vicio_id','vicios','c'),
      ('progresso_periodos','vicio_id','vicios','c'),
      ('progresso_periodos','source_relapse_id','historico_recaidas','c'),
      ('segmentos_economia','vicio_id','vicios','c'),
      ('conquistas_permanentes','usuario_id','usuarios','c'),
      ('conquistas_permanentes','vicio_id','vicios','c')
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
    where conrelid = 'public.eventos_vontade'::regclass
      and contype = 'f'
      and conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.eventos_vontade'::regclass and attname = 'vicio_id'),
        (select attnum from pg_attribute where attrelid = 'public.eventos_vontade'::regclass and attname = 'usuario_id')
      ]::smallint[]
      and confrelid = 'public.vicios'::regclass
      and confdeltype = 'c'
  ) then
    raise exception 'Schema drift: urge event must cascade with its owning habit';
  end if;

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
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.conquistas_permanentes'::regclass
      and conname = 'conquistas_permanentes_scope_unique'
      and contype = 'u'
      and pg_get_constraintdef(oid) like 'UNIQUE NULLS NOT DISTINCT%'
  ) then
    raise exception 'Schema drift: permanent milestone scope must be unique including null habit IDs';
  end if;
  foreach index_name in array array[
    'progresso_periodos_one_open_idx', 'progresso_periodos_history_idx',
    'segmentos_economia_one_open_idx', 'segmentos_economia_legacy_backfill_idx',
    'segmentos_economia_period_idx', 'conquistas_permanentes_user_awarded_idx',
    'conquistas_permanentes_habit_awarded_idx', 'eventos_vontade_user_habit_time_idx'
  ] loop
    if to_regclass(format('public.%s', index_name)) is null then
      raise exception 'Schema drift: missing index %', index_name;
    end if;
  end loop;

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
  for expected in
    select * from (values
      ('public.rebuild_vicio_progress_periods(uuid)'),
      ('public.habit_start_editable(public.vicios)'),
      ('public.guard_vicio_edit()'),
      ('public.require_active_habit()'),
      ('public.lock_habit_history()'),
      ('public.edit_revive_habit(uuid,uuid,integer,jsonb)'),
      ('public.current_habit_savings(uuid)'),
      ('public.capture_vicio_progress_period()'),
      ('public.initialize_vicio_progress_history()'),
      ('public.record_prospective_economy_change()'),
      ('public.execute_mobile_urge_mutation(uuid,uuid,text,text,text,jsonb,text)'),
      ('public.list_urge_events(uuid,uuid,date,date,text,integer,timestamp with time zone,uuid)'),
      ('public.request_password_recovery(text,text,text,uuid,text)'),
      ('public.confirm_password_recovery(text,text,uuid,text,text)'),
      ('public.create_mobile_session(uuid,text,uuid,text,uuid,text)'),
      ('public.advance_credential_version()'),
      ('public.take_recovery_limit(text,text,integer,integer,integer)')
    ) as functions(signature)
  loop
    if to_regprocedure(expected.signature) is null
       or not exists (
         select 1 from pg_proc
         where oid = to_regprocedure(expected.signature)
           and prosecdef
           and proconfig @> array['search_path=' || chr(34) || chr(34)]
       )
       or not has_function_privilege('service_role', expected.signature, 'EXECUTE')
       or has_function_privilege('anon', expected.signature, 'EXECUTE')
       or has_function_privilege('authenticated', expected.signature, 'EXECUTE') then
      raise exception 'Security drift: unsafe progress function %', expected.signature;
    end if;
  end loop;

  if to_regprocedure('public.omit_private_habit_receipt()') is null
     or not has_function_privilege('service_role', 'public.omit_private_habit_receipt()', 'EXECUTE')
     or has_function_privilege('anon', 'public.omit_private_habit_receipt()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.omit_private_habit_receipt()', 'EXECUTE') then
    raise exception 'Security drift: unsafe private receipt filter';
  end if;

  if to_regprocedure('public.normalize_personal_reason(text)') is null
     or not has_function_privilege('service_role', 'public.normalize_personal_reason(text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.normalize_personal_reason(text)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.normalize_personal_reason(text)', 'EXECUTE') then
    raise exception 'Security drift: unsafe personal reason normalizer';
  end if;

  if to_regprocedure('public.valid_urge_trigger_codes(text[])') is null
     or not has_function_privilege('service_role', 'public.valid_urge_trigger_codes(text[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.valid_urge_trigger_codes(text[])', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.valid_urge_trigger_codes(text[])', 'EXECUTE') then
    raise exception 'Security drift: urge trigger validator grants are incorrect';
  end if;

  raise notice 'Full schema, cascades, RLS and grants verified; no data was read';
end;
$$;
