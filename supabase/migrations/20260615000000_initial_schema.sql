-- Initial Revive schema reconstructed from the development database catalog.
-- Apply only to an empty database. Existing databases must pass the read-only
-- schema audit and have this version marked as applied instead.
-- Revive users are application accounts, not Supabase Auth users.

create table public.usuarios (
  id uuid primary key default gen_random_uuid(),
  nome varchar(100) not null,
  email varchar(255) not null unique,
  senha_hash varchar(255) not null,
  data_criacao timestamp default now(),
  data_atualizacao timestamp default now()
);

create table public.vicios (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  nome_vicio varchar(255) not null,
  data_inicio timestamp not null,
  data_ultima_recaida timestamp,
  valor_economizado_por_dia numeric(10, 2) default 0,
  ativo boolean default true,
  data_criacao timestamp default now(),
  data_atualizacao timestamp default now()
);
create index idx_vicios_usuario on public.vicios (usuario_id);

create table public.registros_diarios (
  id uuid primary key default gen_random_uuid(),
  vicio_id uuid not null references public.vicios(id) on delete cascade,
  data_registro date not null,
  humor varchar(50),
  gatilhos text,
  conquistas text,
  observacoes text,
  data_criacao timestamp default now()
);
create index idx_registros_vicio on public.registros_diarios (vicio_id);
create index idx_registros_data on public.registros_diarios (data_registro);

create table public.historico_recaidas (
  id uuid primary key default gen_random_uuid(),
  vicio_id uuid not null references public.vicios(id) on delete cascade,
  data_recaida timestamp not null,
  motivo text,
  dias_abstinencia_perdidos integer,
  data_criacao timestamp default now()
);
create index idx_historico_vicio on public.historico_recaidas (vicio_id);

create table public.metas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  vicio_id uuid references public.vicios(id) on delete set null,
  descricao_meta text not null,
  dias_objetivo integer,
  valor_objetivo numeric(10, 2),
  concluida boolean default false,
  data_criacao timestamp default now(),
  data_conclusao timestamp
);
create index idx_metas_usuario on public.metas (usuario_id);

create table public.mensagens_motivacionais (
  id uuid primary key default gen_random_uuid(),
  tipo_vicio varchar(100),
  mensagem text not null,
  categoria varchar(50),
  ativa boolean default true,
  data_criacao timestamp default now()
);

create table public.marcos (
  id uuid primary key default gen_random_uuid(),
  vicio_id uuid not null references public.vicios(id) on delete cascade,
  tipo_marco varchar(50) not null,
  dias_abstinencia integer not null,
  data_marco timestamp not null,
  mensagem_conquista text,
  data_criacao timestamp default now()
);
create index idx_marcos_vicio on public.marcos (vicio_id);

create function public.atualizar_data_modificacao()
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
before update on public.usuarios
for each row execute function public.atualizar_data_modificacao();
create trigger trigger_vicios_atualizacao
before update on public.vicios
for each row execute function public.atualizar_data_modificacao();

-- Application JWTs are verified by Express. Client roles have no table access;
-- the service_role credential stays on the server.
alter table public.usuarios enable row level security;
alter table public.vicios enable row level security;
alter table public.registros_diarios enable row level security;
alter table public.historico_recaidas enable row level security;
alter table public.metas enable row level security;
alter table public.mensagens_motivacionais enable row level security;
alter table public.marcos enable row level security;
revoke all on table public.usuarios, public.vicios, public.registros_diarios,
  public.historico_recaidas, public.metas, public.mensagens_motivacionais,
  public.marcos from public, anon, authenticated;
grant select, insert, update, delete on table public.usuarios, public.vicios,
  public.registros_diarios, public.historico_recaidas, public.metas,
  public.mensagens_motivacionais, public.marcos to service_role;
revoke all on function public.atualizar_data_modificacao()
  from public, anon, authenticated;
grant execute on function public.atualizar_data_modificacao() to service_role;
