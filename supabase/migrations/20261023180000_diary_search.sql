begin;
-- ICU root case mapping avoids dependence on the database's operating-system locale.
create collation public.diary_search_unicode (provider = icu, locale = 'und', deterministic = true);
create function public.normalize_diary_search(value text) returns text
language sql immutable strict parallel safe set search_path = '' as $$
  select replace(lower(regexp_replace(normalize(value, NFD), U&'[\0300-\036f]', '', 'g')
    collate public.diary_search_unicode), 'ς', 'σ');
$$;
revoke all on function public.normalize_diary_search(text) from public, anon, authenticated;
grant execute on function public.normalize_diary_search(text) to service_role;

-- Ownership and date/ID pagination reuse the existing vicios/diary_records_page indexes.
-- strpos treats quotes, HTML, backslashes, percent and underscore as literal text.
create function public.search_diary_records(p_usuario_id uuid, p_termo text, p_vicio_id uuid,
  p_inicio date, p_fim date, p_limit integer, p_cursor_date date default null, p_cursor_id uuid default null)
returns setof public.registros_diarios language sql stable security invoker set search_path = '' as $$
  select r.* from public.registros_diarios r join public.vicios h on h.id = r.vicio_id
    where h.usuario_id = p_usuario_id and (p_vicio_id is null or r.vicio_id = p_vicio_id)
      and (p_inicio is null or r.data_registro >= p_inicio) and (p_fim is null or r.data_registro <= p_fim)
      and (p_cursor_date is null or (r.data_registro,r.id) < (p_cursor_date,p_cursor_id))
      and char_length(p_termo) <= 100
      and (p_termo = '' or exists (
        select 1 from unnest(array[r.humor,r.gatilhos,r.conquistas,r.observacoes]) field
          where strpos(public.normalize_diary_search(coalesce(field,'')), public.normalize_diary_search(p_termo)) > 0
      ))
    order by r.data_registro desc,r.id desc limit greatest(1,least(p_limit,101));
$$;
revoke all on function public.search_diary_records(uuid,text,uuid,date,date,integer,date,uuid) from public,anon,authenticated;
grant execute on function public.search_diary_records(uuid,text,uuid,date,date,integer,date,uuid) to service_role;
commit;
