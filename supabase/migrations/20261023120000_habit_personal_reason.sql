-- Motivo privado pertence à própria linha: exclusão do hábito/conta remove o conteúdo.
begin;
create function public.normalize_personal_reason(value text)
returns text language sql immutable strict security invoker set search_path = '' as $$
  select nullif(btrim(replace(replace(value, E'\r\n', E'\n'), E'\r', E'\n'),
    U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'), '');
$$;
alter table public.vicios add column motivo_pessoal text
  constraint vicios_personal_reason_valid check (motivo_pessoal is null or
    (length(motivo_pessoal) <= 1000 and public.normalize_personal_reason(motivo_pessoal) is not null
     and motivo_pessoal = public.normalize_personal_reason(motivo_pessoal)));
create or replace function public.edit_revive_habit(p_usuario_id uuid, p_vicio_id uuid, p_revision integer, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_habit public.vicios%rowtype;
begin
  select * into v_habit from public.vicios where id = p_vicio_id and usuario_id = p_usuario_id for update;
  if not found then return jsonb_build_object('status', 404, 'codigo', 'VICIO_NAO_ENCONTRADO'); end if;
  if p_revision is null or p_revision < 1 then return jsonb_build_object('status', 422, 'codigo', 'DADOS_INVALIDOS'); end if;
  if v_habit.revision <> p_revision then return jsonb_build_object('status', 409, 'codigo', 'REVISAO_CONFLITO'); end if;
  if jsonb_typeof(p_patch) is distinct from 'object' or p_patch = '{}'::jsonb
     or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('nome_vicio','data_inicio','valor_economizado_por_dia','ativo','motivo_pessoal'))
     or (p_patch ? 'nome_vicio' and (jsonb_typeof(p_patch->'nome_vicio') <> 'string' or length(btrim(p_patch->>'nome_vicio')) not between 2 and 120))
     or (p_patch ? 'motivo_pessoal' and (jsonb_typeof(p_patch->'motivo_pessoal') not in ('string', 'null')
       or length(public.normalize_personal_reason(p_patch->>'motivo_pessoal')) > 1000))
     or (p_patch ? 'ativo' and jsonb_typeof(p_patch->'ativo') <> 'boolean')
     or (p_patch ? 'valor_economizado_por_dia' and (jsonb_typeof(p_patch->'valor_economizado_por_dia') <> 'number'
       or (p_patch->>'valor_economizado_por_dia')::numeric not between 0 and 99999999.99
       or (p_patch->>'valor_economizado_por_dia')::numeric <> round((p_patch->>'valor_economizado_por_dia')::numeric, 2))) then
    return jsonb_build_object('status', 422, 'codigo', 'DADOS_INVALIDOS');
  end if;
  if p_patch ? 'data_inicio' then
    if jsonb_typeof(p_patch->'data_inicio') <> 'string' or (p_patch->>'data_inicio') !~ '^\d{4}-\d{2}-\d{2}$'
       or (p_patch->>'data_inicio')::date > (now() at time zone 'UTC')::date then
      return jsonb_build_object('status', 422, 'codigo', 'DATA_INICIO_INVALIDA');
    end if;
  end if;
  update public.vicios set
    nome_vicio = case when p_patch ? 'nome_vicio' then btrim(p_patch->>'nome_vicio') else nome_vicio end,
    valor_economizado_por_dia = case when p_patch ? 'valor_economizado_por_dia' then (p_patch->>'valor_economizado_por_dia')::numeric else valor_economizado_por_dia end,
    data_inicio = case when p_patch ? 'data_inicio' then (p_patch->>'data_inicio')::date else data_inicio end,
    motivo_pessoal = case when p_patch ? 'motivo_pessoal' then public.normalize_personal_reason(p_patch->>'motivo_pessoal') else motivo_pessoal end,
    ativo = case when p_patch ? 'ativo' then (p_patch->>'ativo')::boolean else ativo end
  where id = p_vicio_id and usuario_id = p_usuario_id returning * into v_habit;
  return jsonb_build_object('status', 200, 'vicio', to_jsonb(v_habit));
exception
  when sqlstate 'P0001' then
    if sqlerrm = 'INICIO_COM_HISTORICO' then return jsonb_build_object('status', 409, 'codigo', sqlerrm); end if;
    raise;
  when invalid_datetime_format or datetime_field_overflow or invalid_text_representation or numeric_value_out_of_range then
    return jsonb_build_object('status', 422, 'codigo', 'DADOS_INVALIDOS');
end;
$$;
revoke all on function public.normalize_personal_reason(text), public.edit_revive_habit(uuid,uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.normalize_personal_reason(text), public.edit_revive_habit(uuid,uuid,integer,jsonb) to service_role;
-- Recibos de recaída contêm o DTO do hábito. Não duplicar o motivo em retenção idempotente.
create function public.omit_private_habit_receipt()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.response_body := new.response_body #- '{vicio,motivo_pessoal}';
  return new;
end;
$$;
create trigger api_idempotency_omit_personal_reason
  before insert or update of response_body on public.api_idempotency
  for each row execute function public.omit_private_habit_receipt();
revoke all on function public.omit_private_habit_receipt() from public, anon, authenticated;
grant execute on function public.omit_private_habit_receipt() to service_role;
commit;
