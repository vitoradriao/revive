begin;
-- Ownership is enforced even for service-role writes; deletion clears only the reference.
create unique index vicios_owner_id_unique on public.vicios(usuario_id, id);
create table public.journey_preferences (
  usuario_id uuid primary key references public.usuarios(id) on delete cascade,
  primary_habit_id uuid,
  indicator_order jsonb not null default '["current_streak","historical_record","sequence_savings","accumulated_savings"]',
  intro jsonb not null default '{"version":0,"state":"pending"}',
  revision integer not null default 0 check (revision >= 0),
  foreign key (usuario_id, primary_habit_id) references public.vicios(usuario_id, id) on delete set null (primary_habit_id)
);
create function public.valid_journey_preferences(p_order jsonb, p_intro jsonb)
returns boolean language plpgsql immutable security invoker set search_path = '' as $$
begin
  if jsonb_typeof(p_order) is distinct from 'array' or jsonb_typeof(p_intro) is distinct from 'object' then return false; end if;
  return jsonb_array_length(p_order) between 1 and 32
    and not exists(select 1 from jsonb_array_elements(p_order) v where jsonb_typeof(v) <> 'string' or (v #>> '{}') !~ '^[a-z][a-z0-9_]{0,63}$')
    and (select count(distinct v) = count(*) from jsonb_array_elements(p_order) v)
    and (select count(*) = 2 from jsonb_object_keys(p_intro))
    and jsonb_typeof(p_intro->'version') = 'number'
    and (p_intro->>'version') ~ '^[0-9]{1,7}$'
    and (p_intro->>'version')::numeric between 0 and 1000000
    and p_intro->>'state' in ('pending','completed','dismissed')
    and (p_intro->>'version' <> '0' or p_intro->>'state' = 'pending');
end;
$$;
alter table public.journey_preferences add constraint journey_preferences_valid
  check (public.valid_journey_preferences(indicator_order, intro) is true);
create function public.bump_journey_revision()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin new.revision := old.revision + 1; return new; end;
$$;
create trigger journey_revision before update on public.journey_preferences
  for each row execute function public.bump_journey_revision();
alter table public.journey_preferences enable row level security;
revoke all on public.journey_preferences from public, anon, authenticated;
grant all on public.journey_preferences to service_role;
create function public.edit_journey_preferences(p_usuario_id uuid, p_revision integer, p_patch jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_row public.journey_preferences%rowtype; v_primary uuid;
begin
  if p_revision is null or p_revision < 0 or p_revision > 2147483646
    or jsonb_typeof(p_patch) is distinct from 'object' or p_patch = '{}'::jsonb
    or exists(select 1 from jsonb_object_keys(p_patch) k where k not in ('primary_habit_id','indicator_order','intro')) then
    return jsonb_build_object('status',422);
  end if;
  insert into public.journey_preferences(usuario_id) values(p_usuario_id) on conflict do nothing;
  select * into v_row from public.journey_preferences where usuario_id = p_usuario_id for update;
  if v_row.revision <> p_revision then return jsonb_build_object('status',409); end if;
  if p_patch ? 'primary_habit_id' then
    if jsonb_typeof(p_patch->'primary_habit_id') not in ('string','null') then return jsonb_build_object('status',422); end if;
    v_primary := (p_patch->>'primary_habit_id')::uuid;
    if v_primary is not null then
      perform 1 from public.vicios where id = v_primary and usuario_id = p_usuario_id and ativo is not false for share;
      if not found then return jsonb_build_object('status',422); end if;
    end if;
  else v_primary := v_row.primary_habit_id;
  end if;
  if public.valid_journey_preferences(
      case when p_patch ? 'indicator_order' then p_patch->'indicator_order' else v_row.indicator_order end,
      case when p_patch ? 'intro' then p_patch->'intro' else v_row.intro end) is not true then
    return jsonb_build_object('status',422);
  end if;
  update public.journey_preferences set primary_habit_id = v_primary,
    indicator_order = case when p_patch ? 'indicator_order' then p_patch->'indicator_order' else indicator_order end,
    intro = case when p_patch ? 'intro' then p_patch->'intro' else intro end
    where usuario_id = p_usuario_id returning * into v_row;
  return jsonb_build_object('status',200,'preferences',to_jsonb(v_row)-'usuario_id');
exception when invalid_text_representation or numeric_value_out_of_range or foreign_key_violation then
  return jsonb_build_object('status',422);
end;
$$;
revoke all on function public.valid_journey_preferences(jsonb,jsonb), public.bump_journey_revision(), public.edit_journey_preferences(uuid,integer,jsonb) from public, anon, authenticated;
grant execute on function public.valid_journey_preferences(jsonb,jsonb), public.bump_journey_revision(), public.edit_journey_preferences(uuid,integer,jsonb) to service_role;
commit;
