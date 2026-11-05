begin;
-- Extensão compatível: documentos antigos continuam válidos e nenhuma etapa é inventada.
create or replace function public.valid_journey_preferences(p_order jsonb, p_intro jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_order) is distinct from 'array' or jsonb_typeof(p_intro) is distinct from 'object' then return false; end if;
  return jsonb_array_length(p_order) between 1 and 32
    and not exists(select 1 from jsonb_array_elements(p_order) v where jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[a-z][a-z0-9_]{0,63}$')
    and (select count(distinct v) = count(*) from jsonb_array_elements(p_order) v)
    and not exists(select 1 from jsonb_object_keys(p_intro) k where k not in ('version','state','step','habit_id'))
    and jsonb_typeof(p_intro->'version') = 'number'
    and (p_intro->>'version') ~ '^[0-9]{1,7}$'
    and (p_intro->>'version')::numeric between 0 and 1000000
    and p_intro->>'state' in ('pending','completed','dismissed')
    and (p_intro->>'version' <> '0' or p_intro->>'state' = 'pending')
    and (not (p_intro ? 'step' or p_intro ? 'habit_id') or (
      (p_intro->>'version')::numeric > 0
      and p_intro->>'step' in ('habit','reason','checkin')
      and case when p_intro->>'step' = 'habit' then coalesce(p_intro->'habit_id', 'null'::jsonb) = 'null'::jsonb
        else jsonb_typeof(p_intro->'habit_id') = 'string'
          and (p_intro->>'habit_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' end
    ));
end;
$$;

-- A referência preservada também pode representar um hábito removido depois da confirmação.
-- Apenas a adoção de um ID novo exige ownership; arquivar não perde a etapa.
create function public.check_introduction_habit()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.intro->>'habit_id' is not null and
    (tg_op = 'INSERT' or new.usuario_id is distinct from old.usuario_id
      or new.intro->>'habit_id' is distinct from old.intro->>'habit_id') then
    perform 1 from public.vicios where id = (new.intro->>'habit_id')::uuid
      and usuario_id = new.usuario_id for key share;
    if not found then raise foreign_key_violation using message = 'Invalid introduction habit'; end if;
  end if;
  return new;
end;
$$;
create trigger introduction_habit_owner before insert or update on public.journey_preferences
  for each row execute function public.check_introduction_habit();
revoke all on function public.check_introduction_habit() from public, anon, authenticated;
grant execute on function public.check_introduction_habit() to service_role;
commit;
