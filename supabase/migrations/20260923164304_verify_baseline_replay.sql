-- One-time transactional replay in isolated schemas; never touches public application tables.
-- Both schemas are dropped before this migration completes.
do $$ begin if to_regnamespace('revive_issue6_fresh_validation') is not null then raise exception 'Fixture schema already exists'; end if; end $$;
create schema revive_issue6_fresh_validation;

-- 20260615000000_initial_schema.sql
-- Initial Revive schema reconstructed from the development database catalog.
-- Apply only to an empty database. Existing databases must pass the read-only
-- schema audit and have this version marked as applied instead.
-- Revive users are application accounts, not Supabase Auth users.

create table revive_issue6_fresh_validation.usuarios (
  id uuid primary key default gen_random_uuid(),
  nome varchar(100) not null,
  email varchar(255) not null unique,
  senha_hash varchar(255) not null,
  data_criacao timestamp default now(),
  data_atualizacao timestamp default now()
);

create table revive_issue6_fresh_validation.vicios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references revive_issue6_fresh_validation.usuarios(id) on delete cascade,
  nome_vicio varchar(255) not null,
  data_inicio timestamp not null,
  data_ultima_recaida timestamp,
  valor_economizado_por_dia numeric(10, 2) default 0,
  ativo boolean default true,
  data_criacao timestamp default now(),
  data_atualizacao timestamp default now()
);
create index idx_vicios_usuario on revive_issue6_fresh_validation.vicios (usuario_id);

create table revive_issue6_fresh_validation.registros_diarios (
  id uuid primary key default gen_random_uuid(),
  vicio_id uuid not null references revive_issue6_fresh_validation.vicios(id) on delete cascade,
  data_registro date not null,
  humor varchar(50),
  gatilhos text,
  conquistas text,
  observacoes text,
  data_criacao timestamp default now()
);
create index idx_registros_vicio on revive_issue6_fresh_validation.registros_diarios (vicio_id);
create index idx_registros_data on revive_issue6_fresh_validation.registros_diarios (data_registro);

create table revive_issue6_fresh_validation.historico_recaidas (
  id uuid primary key default gen_random_uuid(),
  vicio_id uuid not null references revive_issue6_fresh_validation.vicios(id) on delete cascade,
  data_recaida timestamp not null,
  motivo text,
  dias_abstinencia_perdidos integer,
  data_criacao timestamp default now()
);
create index idx_historico_vicio on revive_issue6_fresh_validation.historico_recaidas (vicio_id);

create table revive_issue6_fresh_validation.metas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references revive_issue6_fresh_validation.usuarios(id) on delete cascade,
  vicio_id uuid references revive_issue6_fresh_validation.vicios(id) on delete set null,
  descricao_meta text not null,
  dias_objetivo integer,
  valor_objetivo numeric(10, 2),
  concluida boolean default false,
  data_criacao timestamp default now(),
  data_conclusao timestamp
);
create index idx_metas_usuario on revive_issue6_fresh_validation.metas (usuario_id);

create table revive_issue6_fresh_validation.mensagens_motivacionais (
  id uuid primary key default gen_random_uuid(),
  tipo_vicio varchar(100),
  mensagem text not null,
  categoria varchar(50),
  ativa boolean default true,
  data_criacao timestamp default now()
);

create table revive_issue6_fresh_validation.marcos (
  id uuid primary key default gen_random_uuid(),
  vicio_id uuid not null references revive_issue6_fresh_validation.vicios(id) on delete cascade,
  tipo_marco varchar(50) not null,
  dias_abstinencia integer not null,
  data_marco timestamp not null,
  mensagem_conquista text,
  data_criacao timestamp default now()
);
create index idx_marcos_vicio on revive_issue6_fresh_validation.marcos (vicio_id);

create function revive_issue6_fresh_validation.atualizar_data_modificacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.data_atualizacao = now();
  return new;
end;
$$;
create trigger trigger_usuarios_atualizacao
before update on revive_issue6_fresh_validation.usuarios
for each row execute function revive_issue6_fresh_validation.atualizar_data_modificacao();
create trigger trigger_vicios_atualizacao
before update on revive_issue6_fresh_validation.vicios
for each row execute function revive_issue6_fresh_validation.atualizar_data_modificacao();

-- Application JWTs are verified by Express. Client roles have no table access;
-- the service_role credential stays on the server.
alter table revive_issue6_fresh_validation.usuarios enable row level security;
alter table revive_issue6_fresh_validation.vicios enable row level security;
alter table revive_issue6_fresh_validation.registros_diarios enable row level security;
alter table revive_issue6_fresh_validation.historico_recaidas enable row level security;
alter table revive_issue6_fresh_validation.metas enable row level security;
alter table revive_issue6_fresh_validation.mensagens_motivacionais enable row level security;
alter table revive_issue6_fresh_validation.marcos enable row level security;
revoke all on table revive_issue6_fresh_validation.usuarios, revive_issue6_fresh_validation.vicios, revive_issue6_fresh_validation.registros_diarios,
  revive_issue6_fresh_validation.historico_recaidas, revive_issue6_fresh_validation.metas, revive_issue6_fresh_validation.mensagens_motivacionais,
  revive_issue6_fresh_validation.marcos from public, anon, authenticated;
grant select, insert, update, delete on table revive_issue6_fresh_validation.usuarios, revive_issue6_fresh_validation.vicios,
  revive_issue6_fresh_validation.registros_diarios, revive_issue6_fresh_validation.historico_recaidas, revive_issue6_fresh_validation.metas,
  revive_issue6_fresh_validation.mensagens_motivacionais, revive_issue6_fresh_validation.marcos to service_role;
revoke all on function revive_issue6_fresh_validation.atualizar_data_modificacao()
  from public, anon, authenticated;
grant execute on function revive_issue6_fresh_validation.atualizar_data_modificacao() to service_role;


-- 20260616000000_add_goal_progress_baseline.sql
alter table revive_issue6_fresh_validation.metas
  add column if not exists iniciar_hoje boolean not null default false,
  add column if not exists data_inicio_meta date,
  add column if not exists dias_abstinencia_inicio integer not null default 0,
  add column if not exists valor_economizado_inicio numeric(12, 2) not null default 0;


-- 20260828223303_mobile_sessions_and_idempotency.sql
-- Server-owned mobile sessions. These tables are accessed only by the API
-- through its privileged Supabase client; no browser/mobile grant is exposed.
create table if not exists revive_issue6_fresh_validation.app_sessions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references revive_issue6_fresh_validation.usuarios(id) on delete cascade,
  refresh_token_hash text not null unique,
  family_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by uuid references revive_issue6_fresh_validation.app_sessions(id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists app_sessions_usuario_id_idx
  on revive_issue6_fresh_validation.app_sessions (usuario_id);
create index if not exists app_sessions_family_id_idx
  on revive_issue6_fresh_validation.app_sessions (family_id);
create index if not exists app_sessions_expires_at_idx
  on revive_issue6_fresh_validation.app_sessions (expires_at);

alter table revive_issue6_fresh_validation.app_sessions enable row level security;
revoke all on table revive_issue6_fresh_validation.app_sessions from anon, authenticated;
grant all on table revive_issue6_fresh_validation.app_sessions to service_role;

create table if not exists revive_issue6_fresh_validation.api_idempotency (
  usuario_id uuid not null references revive_issue6_fresh_validation.usuarios(id) on delete cascade,
  idempotency_key uuid not null,
  request_hash text not null,
  status_code integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  primary key (usuario_id, idempotency_key)
);

create index if not exists api_idempotency_expires_at_idx
  on revive_issue6_fresh_validation.api_idempotency (expires_at);

alter table revive_issue6_fresh_validation.api_idempotency enable row level security;
revoke all on table revive_issue6_fresh_validation.api_idempotency from anon, authenticated;
grant all on table revive_issue6_fresh_validation.api_idempotency to service_role;

comment on table revive_issue6_fresh_validation.app_sessions is
  'Refresh-token sessions owned exclusively by the Revive API.';
comment on table revive_issue6_fresh_validation.api_idempotency is
  'Deduplicates replayed mobile mutations without exposing payloads to clients.';

create table if not exists revive_issue6_fresh_validation.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references revive_issue6_fresh_validation.usuarios(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_error text
);

create index if not exists device_push_tokens_usuario_id_idx
  on revive_issue6_fresh_validation.device_push_tokens (usuario_id);

alter table revive_issue6_fresh_validation.device_push_tokens enable row level security;
revoke all on table revive_issue6_fresh_validation.device_push_tokens from anon, authenticated;
grant all on table revive_issue6_fresh_validation.device_push_tokens to service_role;

create or replace function revive_issue6_fresh_validation.delete_revive_account(p_usuario_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from revive_issue6_fresh_validation.registros_diarios
    where vicio_id in (select id from revive_issue6_fresh_validation.vicios where usuario_id = p_usuario_id);
  delete from revive_issue6_fresh_validation.historico_recaidas
    where vicio_id in (select id from revive_issue6_fresh_validation.vicios where usuario_id = p_usuario_id);
  delete from revive_issue6_fresh_validation.metas where usuario_id = p_usuario_id;
  delete from revive_issue6_fresh_validation.vicios where usuario_id = p_usuario_id;
  delete from revive_issue6_fresh_validation.usuarios where id = p_usuario_id;
end;
$$;

revoke all on function revive_issue6_fresh_validation.delete_revive_account(uuid) from public, anon, authenticated;
grant execute on function revive_issue6_fresh_validation.delete_revive_account(uuid) to service_role;


-- 20260907002648_mobile_bootstrap_author.sql
-- Optional attribution consumed by /api/v2/bootstrap.
alter table revive_issue6_fresh_validation.mensagens_motivacionais
  add column if not exists autor text;


-- 20260907002650_restrict_revive_tables_to_api.sql
-- Prerequisite: the Express API must use SUPABASE_SERVICE_ROLE_KEY.
-- Revive issues its own JWTs; clients access these tables only through Express.
-- No direct anon/authenticated policies are intended for this architecture.
alter table revive_issue6_fresh_validation.usuarios enable row level security;
alter table revive_issue6_fresh_validation.vicios enable row level security;
alter table revive_issue6_fresh_validation.registros_diarios enable row level security;
alter table revive_issue6_fresh_validation.marcos enable row level security;
alter table revive_issue6_fresh_validation.mensagens_motivacionais enable row level security;
alter table revive_issue6_fresh_validation.metas enable row level security;
alter table revive_issue6_fresh_validation.historico_recaidas enable row level security;

revoke all on table revive_issue6_fresh_validation.usuarios, revive_issue6_fresh_validation.vicios, revive_issue6_fresh_validation.registros_diarios,
  revive_issue6_fresh_validation.marcos, revive_issue6_fresh_validation.mensagens_motivacionais, revive_issue6_fresh_validation.metas,
  revive_issue6_fresh_validation.historico_recaidas from public, anon, authenticated;
grant select, insert, update, delete on table revive_issue6_fresh_validation.usuarios, revive_issue6_fresh_validation.vicios,
  revive_issue6_fresh_validation.registros_diarios, revive_issue6_fresh_validation.marcos, revive_issue6_fresh_validation.mensagens_motivacionais,
  revive_issue6_fresh_validation.metas, revive_issue6_fresh_validation.historico_recaidas to service_role;


-- 20260907004754_harden_modification_trigger_search_path.sql
-- The trigger only sets NEW.data_atualizacao = NOW(); no schema lookup needed.
alter function revive_issue6_fresh_validation.atualizar_data_modificacao() set search_path = '';


-- 20260923163030_restrict_modification_trigger_execute.sql
-- Align existing databases with the private function grants of the baseline.
-- Existing triggers continue to execute; only direct client EXECUTE is removed.
revoke all on function revive_issue6_fresh_validation.atualizar_data_modificacao()
  from public, anon, authenticated;
grant execute on function revive_issue6_fresh_validation.atualizar_data_modificacao() to service_role;


-- assert_base_schema.sql
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
      where namespace.nspname = 'revive_issue6_fresh_validation'
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
      where attribute.attrelid = to_regclass(format('revive_issue6_fresh_validation.%I', expected.table_name))
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
      where attrelid = to_regclass(format('revive_issue6_fresh_validation.%I', expected.table_name))
        and attname = 'id' and not attisdropped;
    if not exists (
      select 1 from pg_constraint
      where conrelid = to_regclass(format('revive_issue6_fresh_validation.%I', expected.table_name))
        and contype = 'p' and conkey = array[column_number]::smallint[]
    ) then
      raise exception 'Schema drift in %.id: missing primary key', expected.table_name;
    end if;
    if not exists (
      select 1 from pg_attribute attribute
      join pg_attrdef definition on definition.adrelid = attribute.attrelid
        and definition.adnum = attribute.attnum
      where attribute.attrelid = to_regclass(format('revive_issue6_fresh_validation.%I', expected.table_name))
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
    where constraint_record.conrelid = 'revive_issue6_fresh_validation.usuarios'::regclass
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
      where constraint_record.conrelid = to_regclass(format('revive_issue6_fresh_validation.%I', expected.table_name))
        and constraint_record.contype = 'f'
        and constraint_record.conkey = array[attribute.attnum]::smallint[]
        and constraint_record.confrelid = to_regclass(format('revive_issue6_fresh_validation.%I', expected.referenced_table))
        and constraint_record.confdeltype = expected.delete_action
    ) then
      raise exception 'Schema drift in %.%: expected FK to % with delete action %',
        expected.table_name, expected.column_name,
        expected.referenced_table, expected.delete_action;
    end if;
  end loop;

  if to_regprocedure('revive_issue6_fresh_validation.atualizar_data_modificacao()') is null then
    raise exception 'Schema drift: missing modification trigger function';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = 'revive_issue6_fresh_validation.atualizar_data_modificacao()'::regprocedure
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
      where tgrelid = to_regclass(format('revive_issue6_fresh_validation.%I', expected.table_name))
        and tgname = expected.trigger_name
        and tgfoid = 'revive_issue6_fresh_validation.atualizar_data_modificacao()'::regprocedure
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
      where i.indrelid = to_regclass(format('revive_issue6_fresh_validation.%I', expected.table_name))
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


-- assert_full_schema.sql
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
      where attribute.attrelid = to_regclass(format('revive_issue6_fresh_validation.%I', expected.table_name))
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
    relation_oid := to_regclass(format('revive_issue6_fresh_validation.%I', expected.table_name));
    if relation_oid is null then
      raise exception 'Schema drift: missing table revive_issue6_fresh_validation.%', expected.table_name;
    end if;
    if not (select relrowsecurity from pg_class where oid = relation_oid) then
      raise exception 'Security drift: RLS disabled on revive_issue6_fresh_validation.%', expected.table_name;
    end if;
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if has_table_privilege('anon', relation_oid, privilege_name)
         or has_table_privilege('authenticated', relation_oid, privilege_name) then
        raise exception 'Security drift: client role has % on revive_issue6_fresh_validation.%',
          privilege_name, expected.table_name;
      end if;
      if not has_table_privilege('service_role', relation_oid, privilege_name) then
        raise exception 'Security drift: service_role lacks % on revive_issue6_fresh_validation.%',
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
      where constraint_record.conrelid = to_regclass(format('revive_issue6_fresh_validation.%I', expected.table_name))
        and constraint_record.contype = 'f'
        and constraint_record.conkey = array[attribute.attnum]::smallint[]
        and constraint_record.confrelid = to_regclass(format('revive_issue6_fresh_validation.%I', expected.referenced_table))
        and constraint_record.confdeltype = expected.delete_action
    ) then
      raise exception 'Schema drift in %.%: missing FK to % with delete action %',
        expected.table_name, expected.column_name,
        expected.referenced_table, expected.delete_action;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'revive_issue6_fresh_validation.api_idempotency'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (usuario_id, idempotency_key)'
  ) then
    raise exception 'Schema drift: missing composite idempotency primary key';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'revive_issue6_fresh_validation.app_sessions'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (refresh_token_hash)'
  ) then
    raise exception 'Schema drift: missing refresh token hash uniqueness';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'revive_issue6_fresh_validation.device_push_tokens'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (expo_push_token)'
  ) then
    raise exception 'Schema drift: missing push token uniqueness';
  end if;

  if to_regprocedure('revive_issue6_fresh_validation.delete_revive_account(uuid)') is null then
    raise exception 'Schema drift: missing delete_revive_account(uuid)';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = 'revive_issue6_fresh_validation.delete_revive_account(uuid)'::regprocedure
      and not prosecdef
      and proconfig @> array['search_path=' || chr(34) || chr(34)]
  ) then
    raise exception 'Security drift: account deletion must be SECURITY INVOKER with empty search_path';
  end if;
  if not has_function_privilege(
      'service_role', 'revive_issue6_fresh_validation.delete_revive_account(uuid)', 'EXECUTE')
     or has_function_privilege(
      'anon', 'revive_issue6_fresh_validation.delete_revive_account(uuid)', 'EXECUTE')
     or has_function_privilege(
      'authenticated', 'revive_issue6_fresh_validation.delete_revive_account(uuid)', 'EXECUTE') then
    raise exception 'Security drift: incorrect account deletion EXECUTE grants';
  end if;
  if has_function_privilege('anon',
       'revive_issue6_fresh_validation.atualizar_data_modificacao()', 'EXECUTE')
     or has_function_privilege('authenticated',
       'revive_issue6_fresh_validation.atualizar_data_modificacao()', 'EXECUTE')
     or not has_function_privilege('service_role',
       'revive_issue6_fresh_validation.atualizar_data_modificacao()', 'EXECUTE') then
    raise exception 'Security drift: incorrect modification trigger EXECUTE grants';
  end if;

  raise notice 'Full schema, cascades, RLS and grants verified; no data was read';
end;
$$;


drop schema revive_issue6_fresh_validation cascade;

do $$ begin if to_regnamespace('revive_issue6_legacy_validation') is not null then raise exception 'Fixture schema already exists'; end if; end $$;
create schema revive_issue6_legacy_validation;

-- 20260615000000_initial_schema.sql
-- Initial Revive schema reconstructed from the development database catalog.
-- Apply only to an empty database. Existing databases must pass the read-only
-- schema audit and have this version marked as applied instead.
-- Revive users are application accounts, not Supabase Auth users.

create table revive_issue6_legacy_validation.usuarios (
  id uuid primary key default gen_random_uuid(),
  nome varchar(100) not null,
  email varchar(255) not null unique,
  senha_hash varchar(255) not null,
  data_criacao timestamp default now(),
  data_atualizacao timestamp default now()
);

create table revive_issue6_legacy_validation.vicios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references revive_issue6_legacy_validation.usuarios(id) on delete cascade,
  nome_vicio varchar(255) not null,
  data_inicio timestamp not null,
  data_ultima_recaida timestamp,
  valor_economizado_por_dia numeric(10, 2) default 0,
  ativo boolean default true,
  data_criacao timestamp default now(),
  data_atualizacao timestamp default now()
);
create index idx_vicios_usuario on revive_issue6_legacy_validation.vicios (usuario_id);

create table revive_issue6_legacy_validation.registros_diarios (
  id uuid primary key default gen_random_uuid(),
  vicio_id uuid not null references revive_issue6_legacy_validation.vicios(id) on delete cascade,
  data_registro date not null,
  humor varchar(50),
  gatilhos text,
  conquistas text,
  observacoes text,
  data_criacao timestamp default now()
);
create index idx_registros_vicio on revive_issue6_legacy_validation.registros_diarios (vicio_id);
create index idx_registros_data on revive_issue6_legacy_validation.registros_diarios (data_registro);

create table revive_issue6_legacy_validation.historico_recaidas (
  id uuid primary key default gen_random_uuid(),
  vicio_id uuid not null references revive_issue6_legacy_validation.vicios(id) on delete cascade,
  data_recaida timestamp not null,
  motivo text,
  dias_abstinencia_perdidos integer,
  data_criacao timestamp default now()
);
create index idx_historico_vicio on revive_issue6_legacy_validation.historico_recaidas (vicio_id);

create table revive_issue6_legacy_validation.metas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references revive_issue6_legacy_validation.usuarios(id) on delete cascade,
  vicio_id uuid references revive_issue6_legacy_validation.vicios(id) on delete set null,
  descricao_meta text not null,
  dias_objetivo integer,
  valor_objetivo numeric(10, 2),
  concluida boolean default false,
  data_criacao timestamp default now(),
  data_conclusao timestamp
);
create index idx_metas_usuario on revive_issue6_legacy_validation.metas (usuario_id);

create table revive_issue6_legacy_validation.mensagens_motivacionais (
  id uuid primary key default gen_random_uuid(),
  tipo_vicio varchar(100),
  mensagem text not null,
  categoria varchar(50),
  ativa boolean default true,
  data_criacao timestamp default now()
);

create table revive_issue6_legacy_validation.marcos (
  id uuid primary key default gen_random_uuid(),
  vicio_id uuid not null references revive_issue6_legacy_validation.vicios(id) on delete cascade,
  tipo_marco varchar(50) not null,
  dias_abstinencia integer not null,
  data_marco timestamp not null,
  mensagem_conquista text,
  data_criacao timestamp default now()
);
create index idx_marcos_vicio on revive_issue6_legacy_validation.marcos (vicio_id);

create function revive_issue6_legacy_validation.atualizar_data_modificacao()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.data_atualizacao = now();
  return new;
end;
$$;
create trigger trigger_usuarios_atualizacao
before update on revive_issue6_legacy_validation.usuarios
for each row execute function revive_issue6_legacy_validation.atualizar_data_modificacao();
create trigger trigger_vicios_atualizacao
before update on revive_issue6_legacy_validation.vicios
for each row execute function revive_issue6_legacy_validation.atualizar_data_modificacao();

-- Application JWTs are verified by Express. Client roles have no table access;
-- the service_role credential stays on the server.
alter table revive_issue6_legacy_validation.usuarios enable row level security;
alter table revive_issue6_legacy_validation.vicios enable row level security;
alter table revive_issue6_legacy_validation.registros_diarios enable row level security;
alter table revive_issue6_legacy_validation.historico_recaidas enable row level security;
alter table revive_issue6_legacy_validation.metas enable row level security;
alter table revive_issue6_legacy_validation.mensagens_motivacionais enable row level security;
alter table revive_issue6_legacy_validation.marcos enable row level security;
revoke all on table revive_issue6_legacy_validation.usuarios, revive_issue6_legacy_validation.vicios, revive_issue6_legacy_validation.registros_diarios,
  revive_issue6_legacy_validation.historico_recaidas, revive_issue6_legacy_validation.metas, revive_issue6_legacy_validation.mensagens_motivacionais,
  revive_issue6_legacy_validation.marcos from public, anon, authenticated;
grant select, insert, update, delete on table revive_issue6_legacy_validation.usuarios, revive_issue6_legacy_validation.vicios,
  revive_issue6_legacy_validation.registros_diarios, revive_issue6_legacy_validation.historico_recaidas, revive_issue6_legacy_validation.metas,
  revive_issue6_legacy_validation.mensagens_motivacionais, revive_issue6_legacy_validation.marcos to service_role;
revoke all on function revive_issue6_legacy_validation.atualizar_data_modificacao()
  from public, anon, authenticated;
grant execute on function revive_issue6_legacy_validation.atualizar_data_modificacao() to service_role;


-- Synthetic legacy fixture
-- Run only in a disposable database after 20260615000000_initial_schema.sql
-- and before the five incremental migrations. All identifiers and content are
-- synthetic. Do not execute on a shared or production database.
insert into revive_issue6_legacy_validation.usuarios (id, nome, email, senha_hash)
values (
  '00000000-0000-4000-8000-000000000101',
  'Pessoa de Teste',
  'fixture-legacy@revive.invalid',
  'synthetic-hash-not-for-login'
);

insert into revive_issue6_legacy_validation.vicios (
  id, usuario_id, nome_vicio, data_inicio, valor_economizado_por_dia
) values (
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000101',
  'Hábito fictício',
  '2026-01-01 12:00:00',
  12.50
);

insert into revive_issue6_legacy_validation.registros_diarios (id, vicio_id, data_registro, humor)
values (
  '00000000-0000-4000-8000-000000000301',
  '00000000-0000-4000-8000-000000000201',
  '2026-01-02',
  'bem'
);

insert into revive_issue6_legacy_validation.historico_recaidas (id, vicio_id, data_recaida, motivo)
values (
  '00000000-0000-4000-8000-000000000401',
  '00000000-0000-4000-8000-000000000201',
  '2026-01-03 12:00:00',
  'Motivo fictício'
);

insert into revive_issue6_legacy_validation.metas (id, usuario_id, vicio_id, descricao_meta, dias_objetivo)
values (
  '00000000-0000-4000-8000-000000000501',
  '00000000-0000-4000-8000-000000000101',
  '00000000-0000-4000-8000-000000000201',
  'Meta fictícia',
  7
);

insert into revive_issue6_legacy_validation.mensagens_motivacionais (id, mensagem, tipo_vicio)
values (
  '00000000-0000-4000-8000-000000000601',
  'Mensagem fictícia',
  'geral'
);

insert into revive_issue6_legacy_validation.marcos (id, vicio_id, tipo_marco, dias_abstinencia, data_marco)
values (
  '00000000-0000-4000-8000-000000000701',
  '00000000-0000-4000-8000-000000000201',
  'teste',
  1,
  '2026-01-02 12:00:00'
);


-- 20260616000000_add_goal_progress_baseline.sql
alter table revive_issue6_legacy_validation.metas
  add column if not exists iniciar_hoje boolean not null default false,
  add column if not exists data_inicio_meta date,
  add column if not exists dias_abstinencia_inicio integer not null default 0,
  add column if not exists valor_economizado_inicio numeric(12, 2) not null default 0;


-- 20260828223303_mobile_sessions_and_idempotency.sql
-- Server-owned mobile sessions. These tables are accessed only by the API
-- through its privileged Supabase client; no browser/mobile grant is exposed.
create table if not exists revive_issue6_legacy_validation.app_sessions (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references revive_issue6_legacy_validation.usuarios(id) on delete cascade,
  refresh_token_hash text not null unique,
  family_id uuid not null,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by uuid references revive_issue6_legacy_validation.app_sessions(id) on delete set null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now()
);

create index if not exists app_sessions_usuario_id_idx
  on revive_issue6_legacy_validation.app_sessions (usuario_id);
create index if not exists app_sessions_family_id_idx
  on revive_issue6_legacy_validation.app_sessions (family_id);
create index if not exists app_sessions_expires_at_idx
  on revive_issue6_legacy_validation.app_sessions (expires_at);

alter table revive_issue6_legacy_validation.app_sessions enable row level security;
revoke all on table revive_issue6_legacy_validation.app_sessions from anon, authenticated;
grant all on table revive_issue6_legacy_validation.app_sessions to service_role;

create table if not exists revive_issue6_legacy_validation.api_idempotency (
  usuario_id uuid not null references revive_issue6_legacy_validation.usuarios(id) on delete cascade,
  idempotency_key uuid not null,
  request_hash text not null,
  status_code integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  primary key (usuario_id, idempotency_key)
);

create index if not exists api_idempotency_expires_at_idx
  on revive_issue6_legacy_validation.api_idempotency (expires_at);

alter table revive_issue6_legacy_validation.api_idempotency enable row level security;
revoke all on table revive_issue6_legacy_validation.api_idempotency from anon, authenticated;
grant all on table revive_issue6_legacy_validation.api_idempotency to service_role;

comment on table revive_issue6_legacy_validation.app_sessions is
  'Refresh-token sessions owned exclusively by the Revive API.';
comment on table revive_issue6_legacy_validation.api_idempotency is
  'Deduplicates replayed mobile mutations without exposing payloads to clients.';

create table if not exists revive_issue6_legacy_validation.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references revive_issue6_legacy_validation.usuarios(id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('android', 'ios')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_error text
);

create index if not exists device_push_tokens_usuario_id_idx
  on revive_issue6_legacy_validation.device_push_tokens (usuario_id);

alter table revive_issue6_legacy_validation.device_push_tokens enable row level security;
revoke all on table revive_issue6_legacy_validation.device_push_tokens from anon, authenticated;
grant all on table revive_issue6_legacy_validation.device_push_tokens to service_role;

create or replace function revive_issue6_legacy_validation.delete_revive_account(p_usuario_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  delete from revive_issue6_legacy_validation.registros_diarios
    where vicio_id in (select id from revive_issue6_legacy_validation.vicios where usuario_id = p_usuario_id);
  delete from revive_issue6_legacy_validation.historico_recaidas
    where vicio_id in (select id from revive_issue6_legacy_validation.vicios where usuario_id = p_usuario_id);
  delete from revive_issue6_legacy_validation.metas where usuario_id = p_usuario_id;
  delete from revive_issue6_legacy_validation.vicios where usuario_id = p_usuario_id;
  delete from revive_issue6_legacy_validation.usuarios where id = p_usuario_id;
end;
$$;

revoke all on function revive_issue6_legacy_validation.delete_revive_account(uuid) from public, anon, authenticated;
grant execute on function revive_issue6_legacy_validation.delete_revive_account(uuid) to service_role;


-- 20260907002648_mobile_bootstrap_author.sql
-- Optional attribution consumed by /api/v2/bootstrap.
alter table revive_issue6_legacy_validation.mensagens_motivacionais
  add column if not exists autor text;


-- 20260907002650_restrict_revive_tables_to_api.sql
-- Prerequisite: the Express API must use SUPABASE_SERVICE_ROLE_KEY.
-- Revive issues its own JWTs; clients access these tables only through Express.
-- No direct anon/authenticated policies are intended for this architecture.
alter table revive_issue6_legacy_validation.usuarios enable row level security;
alter table revive_issue6_legacy_validation.vicios enable row level security;
alter table revive_issue6_legacy_validation.registros_diarios enable row level security;
alter table revive_issue6_legacy_validation.marcos enable row level security;
alter table revive_issue6_legacy_validation.mensagens_motivacionais enable row level security;
alter table revive_issue6_legacy_validation.metas enable row level security;
alter table revive_issue6_legacy_validation.historico_recaidas enable row level security;

revoke all on table revive_issue6_legacy_validation.usuarios, revive_issue6_legacy_validation.vicios, revive_issue6_legacy_validation.registros_diarios,
  revive_issue6_legacy_validation.marcos, revive_issue6_legacy_validation.mensagens_motivacionais, revive_issue6_legacy_validation.metas,
  revive_issue6_legacy_validation.historico_recaidas from public, anon, authenticated;
grant select, insert, update, delete on table revive_issue6_legacy_validation.usuarios, revive_issue6_legacy_validation.vicios,
  revive_issue6_legacy_validation.registros_diarios, revive_issue6_legacy_validation.marcos, revive_issue6_legacy_validation.mensagens_motivacionais,
  revive_issue6_legacy_validation.metas, revive_issue6_legacy_validation.historico_recaidas to service_role;


-- 20260907004754_harden_modification_trigger_search_path.sql
-- The trigger only sets NEW.data_atualizacao = NOW(); no schema lookup needed.
alter function revive_issue6_legacy_validation.atualizar_data_modificacao() set search_path = '';


-- 20260923163030_restrict_modification_trigger_execute.sql
-- Align existing databases with the private function grants of the baseline.
-- Existing triggers continue to execute; only direct client EXECUTE is removed.
revoke all on function revive_issue6_legacy_validation.atualizar_data_modificacao()
  from public, anon, authenticated;
grant execute on function revive_issue6_legacy_validation.atualizar_data_modificacao() to service_role;


-- assert_base_schema.sql
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
      where namespace.nspname = 'revive_issue6_legacy_validation'
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
      where attribute.attrelid = to_regclass(format('revive_issue6_legacy_validation.%I', expected.table_name))
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
      where attrelid = to_regclass(format('revive_issue6_legacy_validation.%I', expected.table_name))
        and attname = 'id' and not attisdropped;
    if not exists (
      select 1 from pg_constraint
      where conrelid = to_regclass(format('revive_issue6_legacy_validation.%I', expected.table_name))
        and contype = 'p' and conkey = array[column_number]::smallint[]
    ) then
      raise exception 'Schema drift in %.id: missing primary key', expected.table_name;
    end if;
    if not exists (
      select 1 from pg_attribute attribute
      join pg_attrdef definition on definition.adrelid = attribute.attrelid
        and definition.adnum = attribute.attnum
      where attribute.attrelid = to_regclass(format('revive_issue6_legacy_validation.%I', expected.table_name))
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
    where constraint_record.conrelid = 'revive_issue6_legacy_validation.usuarios'::regclass
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
      where constraint_record.conrelid = to_regclass(format('revive_issue6_legacy_validation.%I', expected.table_name))
        and constraint_record.contype = 'f'
        and constraint_record.conkey = array[attribute.attnum]::smallint[]
        and constraint_record.confrelid = to_regclass(format('revive_issue6_legacy_validation.%I', expected.referenced_table))
        and constraint_record.confdeltype = expected.delete_action
    ) then
      raise exception 'Schema drift in %.%: expected FK to % with delete action %',
        expected.table_name, expected.column_name,
        expected.referenced_table, expected.delete_action;
    end if;
  end loop;

  if to_regprocedure('revive_issue6_legacy_validation.atualizar_data_modificacao()') is null then
    raise exception 'Schema drift: missing modification trigger function';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = 'revive_issue6_legacy_validation.atualizar_data_modificacao()'::regprocedure
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
      where tgrelid = to_regclass(format('revive_issue6_legacy_validation.%I', expected.table_name))
        and tgname = expected.trigger_name
        and tgfoid = 'revive_issue6_legacy_validation.atualizar_data_modificacao()'::regprocedure
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
      where i.indrelid = to_regclass(format('revive_issue6_legacy_validation.%I', expected.table_name))
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


-- assert_full_schema.sql
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
      where attribute.attrelid = to_regclass(format('revive_issue6_legacy_validation.%I', expected.table_name))
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
    relation_oid := to_regclass(format('revive_issue6_legacy_validation.%I', expected.table_name));
    if relation_oid is null then
      raise exception 'Schema drift: missing table revive_issue6_legacy_validation.%', expected.table_name;
    end if;
    if not (select relrowsecurity from pg_class where oid = relation_oid) then
      raise exception 'Security drift: RLS disabled on revive_issue6_legacy_validation.%', expected.table_name;
    end if;
    foreach privilege_name in array array['SELECT','INSERT','UPDATE','DELETE'] loop
      if has_table_privilege('anon', relation_oid, privilege_name)
         or has_table_privilege('authenticated', relation_oid, privilege_name) then
        raise exception 'Security drift: client role has % on revive_issue6_legacy_validation.%',
          privilege_name, expected.table_name;
      end if;
      if not has_table_privilege('service_role', relation_oid, privilege_name) then
        raise exception 'Security drift: service_role lacks % on revive_issue6_legacy_validation.%',
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
      where constraint_record.conrelid = to_regclass(format('revive_issue6_legacy_validation.%I', expected.table_name))
        and constraint_record.contype = 'f'
        and constraint_record.conkey = array[attribute.attnum]::smallint[]
        and constraint_record.confrelid = to_regclass(format('revive_issue6_legacy_validation.%I', expected.referenced_table))
        and constraint_record.confdeltype = expected.delete_action
    ) then
      raise exception 'Schema drift in %.%: missing FK to % with delete action %',
        expected.table_name, expected.column_name,
        expected.referenced_table, expected.delete_action;
    end if;
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'revive_issue6_legacy_validation.api_idempotency'::regclass
      and contype = 'p'
      and pg_get_constraintdef(oid) = 'PRIMARY KEY (usuario_id, idempotency_key)'
  ) then
    raise exception 'Schema drift: missing composite idempotency primary key';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'revive_issue6_legacy_validation.app_sessions'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (refresh_token_hash)'
  ) then
    raise exception 'Schema drift: missing refresh token hash uniqueness';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'revive_issue6_legacy_validation.device_push_tokens'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (expo_push_token)'
  ) then
    raise exception 'Schema drift: missing push token uniqueness';
  end if;

  if to_regprocedure('revive_issue6_legacy_validation.delete_revive_account(uuid)') is null then
    raise exception 'Schema drift: missing delete_revive_account(uuid)';
  end if;
  if not exists (
    select 1 from pg_proc
    where oid = 'revive_issue6_legacy_validation.delete_revive_account(uuid)'::regprocedure
      and not prosecdef
      and proconfig @> array['search_path=' || chr(34) || chr(34)]
  ) then
    raise exception 'Security drift: account deletion must be SECURITY INVOKER with empty search_path';
  end if;
  if not has_function_privilege(
      'service_role', 'revive_issue6_legacy_validation.delete_revive_account(uuid)', 'EXECUTE')
     or has_function_privilege(
      'anon', 'revive_issue6_legacy_validation.delete_revive_account(uuid)', 'EXECUTE')
     or has_function_privilege(
      'authenticated', 'revive_issue6_legacy_validation.delete_revive_account(uuid)', 'EXECUTE') then
    raise exception 'Security drift: incorrect account deletion EXECUTE grants';
  end if;
  if has_function_privilege('anon',
       'revive_issue6_legacy_validation.atualizar_data_modificacao()', 'EXECUTE')
     or has_function_privilege('authenticated',
       'revive_issue6_legacy_validation.atualizar_data_modificacao()', 'EXECUTE')
     or not has_function_privilege('service_role',
       'revive_issue6_legacy_validation.atualizar_data_modificacao()', 'EXECUTE') then
    raise exception 'Security drift: incorrect modification trigger EXECUTE grants';
  end if;

  raise notice 'Full schema, cascades, RLS and grants verified; no data was read';
end;
$$;


-- Synthetic relationship and cascade assertion
-- Run after all incremental migrations in the disposable legacy fixture DB.
-- The isolated schema is dropped after this account-deletion assertion.

do $$
declare
  test_user constant uuid := '00000000-0000-4000-8000-000000000101';
  test_vicio constant uuid := '00000000-0000-4000-8000-000000000201';
begin
  if not exists (select 1 from revive_issue6_legacy_validation.usuarios where id = test_user)
     or not exists (select 1 from revive_issue6_legacy_validation.vicios where id = test_vicio and usuario_id = test_user)
     or not exists (select 1 from revive_issue6_legacy_validation.registros_diarios
                    where id = '00000000-0000-4000-8000-000000000301' and vicio_id = test_vicio)
     or not exists (select 1 from revive_issue6_legacy_validation.historico_recaidas
                    where id = '00000000-0000-4000-8000-000000000401' and vicio_id = test_vicio)
     or not exists (select 1 from revive_issue6_legacy_validation.metas
                    where id = '00000000-0000-4000-8000-000000000501'
                      and usuario_id = test_user and vicio_id = test_vicio)
     or not exists (select 1 from revive_issue6_legacy_validation.marcos
                    where id = '00000000-0000-4000-8000-000000000701' and vicio_id = test_vicio)
     or not exists (select 1 from revive_issue6_legacy_validation.mensagens_motivacionais
                    where id = '00000000-0000-4000-8000-000000000601') then
    raise exception 'Synthetic legacy data was lost or relationships changed';
  end if;

  if not exists (select 1 from revive_issue6_legacy_validation.metas
                 where id = '00000000-0000-4000-8000-000000000501'
                   and iniciar_hoje = false and dias_abstinencia_inicio = 0
                   and valor_economizado_inicio = 0) then
    raise exception 'Goal progress defaults were not backfilled';
  end if;

  insert into revive_issue6_legacy_validation.app_sessions
    (usuario_id, refresh_token_hash, family_id, expires_at)
  values (test_user, 'synthetic-refresh-hash', gen_random_uuid(), now() + interval '1 day');
  insert into revive_issue6_legacy_validation.api_idempotency
    (usuario_id, idempotency_key, request_hash)
  values (test_user, gen_random_uuid(), 'synthetic-request-hash');
  insert into revive_issue6_legacy_validation.device_push_tokens
    (usuario_id, expo_push_token, platform)
  values (test_user, 'ExponentPushToken[syntheticfixture]', 'android');

  perform revive_issue6_legacy_validation.delete_revive_account(test_user);
  if exists (select 1 from revive_issue6_legacy_validation.usuarios where id = test_user)
     or exists (select 1 from revive_issue6_legacy_validation.vicios where usuario_id = test_user)
     or exists (select 1 from revive_issue6_legacy_validation.metas where usuario_id = test_user)
     or exists (select 1 from revive_issue6_legacy_validation.marcos where vicio_id = test_vicio)
     or exists (select 1 from revive_issue6_legacy_validation.registros_diarios where vicio_id = test_vicio)
     or exists (select 1 from revive_issue6_legacy_validation.historico_recaidas where vicio_id = test_vicio)
     or exists (select 1 from revive_issue6_legacy_validation.app_sessions where usuario_id = test_user)
     or exists (select 1 from revive_issue6_legacy_validation.api_idempotency where usuario_id = test_user)
     or exists (select 1 from revive_issue6_legacy_validation.device_push_tokens where usuario_id = test_user) then
    raise exception 'Account deletion left owned rows behind';
  end if;
  raise notice 'Synthetic legacy rows survived migration; account deletion cascades';
end;
$$;


drop schema revive_issue6_legacy_validation cascade;
