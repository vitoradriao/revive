-- Read-only structural gate for adopting the baseline on an existing database.
-- It permits extra columns added by later migrations, but rejects mismatches in
-- the base contract. Run before migration repair; never run the baseline DDL on
-- a database that already has application tables.
do $$
declare
  expected record;
  actual_type text;
  actual_not_null boolean;
  column_number smallint;
begin
  for expected in
    select * from (values
      ('usuarios','id','uuid',true),
      ('usuarios','nome','character varying(100)',true),
      ('usuarios','email','character varying(255)',true),
      ('usuarios','senha_hash','character varying(255)',true),
      ('usuarios','data_criacao','timestamp without time zone',false),
      ('usuarios','data_atualizacao','timestamp without time zone',false),
      ('vicios','id','uuid',true),
      ('vicios','usuario_id','uuid',true),
      ('vicios','nome_vicio','character varying(255)',true),
      ('vicios','data_inicio','timestamp without time zone',true),
      ('vicios','data_ultima_recaida','timestamp without time zone',false),
      ('vicios','valor_economizado_por_dia','numeric(10,2)',false),
      ('vicios','ativo','boolean',false),
      ('vicios','data_criacao','timestamp without time zone',false),
      ('vicios','data_atualizacao','timestamp without time zone',false),
      ('registros_diarios','id','uuid',true),
      ('registros_diarios','vicio_id','uuid',true),
      ('registros_diarios','data_registro','date',true),
      ('registros_diarios','humor','character varying(50)',false),
      ('registros_diarios','gatilhos','text',false),
      ('registros_diarios','conquistas','text',false),
      ('registros_diarios','observacoes','text',false),
      ('registros_diarios','data_criacao','timestamp without time zone',false),
      ('historico_recaidas','id','uuid',true),
      ('historico_recaidas','vicio_id','uuid',true),
      ('historico_recaidas','data_recaida','timestamp without time zone',true),
      ('historico_recaidas','motivo','text',false),
      ('historico_recaidas','dias_abstinencia_perdidos','integer',false),
      ('historico_recaidas','data_criacao','timestamp without time zone',false),
      ('metas','id','uuid',true),
      ('metas','usuario_id','uuid',true),
      ('metas','vicio_id','uuid',false),
      ('metas','descricao_meta','text',true),
      ('metas','dias_objetivo','integer',false),
      ('metas','valor_objetivo','numeric(10,2)',false),
      ('metas','concluida','boolean',false),
      ('metas','data_criacao','timestamp without time zone',false),
      ('metas','data_conclusao','timestamp without time zone',false),
      ('mensagens_motivacionais','id','uuid',true),
      ('mensagens_motivacionais','mensagem','text',true),
      ('mensagens_motivacionais','tipo_vicio','character varying(100)',false),
      ('mensagens_motivacionais','categoria','character varying(50)',false),
      ('mensagens_motivacionais','ativa','boolean',false),
      ('mensagens_motivacionais','data_criacao','timestamp without time zone',false),
      ('marcos','id','uuid',true),
      ('marcos','vicio_id','uuid',true),
      ('marcos','tipo_marco','character varying(50)',true),
      ('marcos','dias_abstinencia','integer',true),
      ('marcos','data_marco','timestamp without time zone',true),
      ('marcos','mensagem_conquista','text',false),
      ('marcos','data_criacao','timestamp without time zone',false)
    ) as specification(table_name, column_name, data_type, required)
  loop
    actual_type := null;
    actual_not_null := null;
    select format_type(attribute.atttypid, attribute.atttypmod), attribute.attnotnull
      into actual_type, actual_not_null
      from pg_namespace namespace
      join pg_class relation on relation.relnamespace = namespace.oid
      join pg_attribute attribute on attribute.attrelid = relation.oid
      where namespace.nspname = 'public'
        and relation.relname = expected.table_name
        and relation.relkind in ('r', 'p')
        and attribute.attname = expected.column_name
        and attribute.attnum > 0
        and not attribute.attisdropped;
    if actual_type is distinct from expected.data_type
       or actual_not_null is distinct from expected.required then
      raise exception 'Schema drift in %.%: expected % not_null=%, found % not_null=%',
        expected.table_name, expected.column_name, expected.data_type,
        expected.required, coalesce(actual_type, '<missing>'), actual_not_null;
    end if;
  end loop;

  for expected in
    select * from (values
      ('usuarios','data_criacao','now()'),
      ('usuarios','data_atualizacao','now()'),
      ('vicios','valor_economizado_por_dia','0'),
      ('vicios','ativo','true'),
      ('vicios','data_criacao','now()'),
      ('vicios','data_atualizacao','now()'),
      ('registros_diarios','data_criacao','now()'),
      ('historico_recaidas','data_criacao','now()'),
      ('metas','concluida','false'),
      ('metas','data_criacao','now()'),
      ('mensagens_motivacionais','ativa','true'),
      ('mensagens_motivacionais','data_criacao','now()'),
      ('marcos','data_criacao','now()')
    ) as defaults(table_name, column_name, expression)
  loop
    if not exists (
      select 1 from pg_attribute attribute
      join pg_attrdef definition on definition.adrelid = attribute.attrelid
        and definition.adnum = attribute.attnum
      where attribute.attrelid = to_regclass(format('public.%I', expected.table_name))
        and attribute.attname = expected.column_name
        and pg_get_expr(definition.adbin, definition.adrelid) = expected.expression
    ) then
      raise exception 'Schema drift in %.%: expected default %',
        expected.table_name, expected.column_name, expected.expression;
    end if;
  end loop;

  for expected in
    select * from (values
      ('usuarios'), ('vicios'), ('registros_diarios'),
      ('historico_recaidas'), ('metas'), ('mensagens_motivacionais'),
      ('marcos')
    ) as tables(table_name)
  loop
    select attnum into column_number from pg_attribute
      where attrelid = to_regclass(format('public.%I', expected.table_name))
        and attname = 'id' and not attisdropped;
    if not exists (
      select 1 from pg_constraint
      where conrelid = to_regclass(format('public.%I', expected.table_name))
        and contype = 'p' and conkey = array[column_number]::smallint[]
    ) then
      raise exception 'Schema drift in %.id: missing primary key', expected.table_name;
    end if;
    if not exists (
      select 1 from pg_attribute attribute
      join pg_attrdef definition on definition.adrelid = attribute.attrelid
        and definition.adnum = attribute.attnum
      where attribute.attrelid = to_regclass(format('public.%I', expected.table_name))
        and attribute.attname = 'id'
        and pg_get_expr(definition.adbin, definition.adrelid) = 'gen_random_uuid()'
    ) then
      raise exception 'Schema drift in %.id: missing gen_random_uuid() default',
        expected.table_name;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint constraint_record
    join pg_attribute attribute on attribute.attrelid = constraint_record.conrelid
      and attribute.attname = 'email'
    where constraint_record.conrelid = 'public.usuarios'::regclass
      and constraint_record.contype = 'u'
      and constraint_record.conkey = array[attribute.attnum]::smallint[]
  ) then
    raise exception 'Schema drift in usuarios.email: missing unique constraint';
  end if;

  for expected in
    select * from (values
      ('vicios','usuario_id','usuarios','c'),
      ('registros_diarios','vicio_id','vicios','c'),
      ('historico_recaidas','vicio_id','vicios','c'),
      ('metas','usuario_id','usuarios','c'),
      ('metas','vicio_id','vicios','n'),
      ('marcos','vicio_id','vicios','c')
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
      raise exception 'Schema drift in %.%: expected FK to % with delete action %',
        expected.table_name, expected.column_name,
        expected.referenced_table, expected.delete_action;
    end if;
  end loop;

  if to_regprocedure('public.atualizar_data_modificacao()') is null then
    raise exception 'Schema drift: missing modification trigger function';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = 'public.atualizar_data_modificacao()'::regprocedure
      and not prosecdef
      and proconfig @> array['search_path=' || chr(34) || chr(34)]
  ) then
    raise exception 'Security drift: modification trigger must use an empty search_path';
  end if;
  for expected in
    select * from (values
      ('usuarios','trigger_usuarios_atualizacao'),
      ('vicios','trigger_vicios_atualizacao')
    ) as triggers(table_name, trigger_name)
  loop
    if not exists (
      select 1 from pg_trigger
      where tgrelid = to_regclass(format('public.%I', expected.table_name))
        and tgname = expected.trigger_name
        and tgfoid = 'public.atualizar_data_modificacao()'::regprocedure
        and not tgisinternal and tgenabled <> 'D'
    ) then
      raise exception 'Schema drift: missing modification trigger on %', expected.table_name;
    end if;
  end loop;

  for expected in
    select * from (values
      ('vicios','idx_vicios_usuario','usuario_id'),
      ('registros_diarios','idx_registros_vicio','vicio_id'),
      ('registros_diarios','idx_registros_data','data_registro'),
      ('historico_recaidas','idx_historico_vicio','vicio_id'),
      ('metas','idx_metas_usuario','usuario_id'),
      ('marcos','idx_marcos_vicio','vicio_id')
    ) as indexes(table_name, index_name, column_name)
  loop
    if not exists (
      select 1 from pg_index i
      join pg_class idx on idx.oid = i.indexrelid
      join pg_attribute a on a.attrelid = i.indrelid
        and a.attnum = i.indkey[0]
      where i.indrelid = to_regclass(format('public.%I', expected.table_name))
        and idx.relname = expected.index_name
        and i.indisvalid and i.indisready and i.indnkeyatts = 1
        and a.attname = expected.column_name
    ) then
      raise exception 'Schema drift: missing index %.% on %',
        expected.table_name, expected.index_name, expected.column_name;
    end if;
  end loop;

  raise notice 'Base schema is structurally compatible; no data was read';
end;
$$;
