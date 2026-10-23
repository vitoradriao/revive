const corpus = require('../fixtures/diary-search.json');
// Test-only SQL, shared by the real PostgreSQL server and single-user verification.
function diarySearchSql() {
    const fixture = JSON.stringify(corpus).replace(/'/g, "''");
    return `begin;
do $verify$
declare
  owner_id uuid := gen_random_uuid(); other_id uuid := gen_random_uuid();
  habit_id uuid := gen_random_uuid(); year_habit uuid := gen_random_uuid(); foreign_habit uuid := gen_random_uuid();
  corpus jsonb := '${fixture}'::jsonb;
  row jsonb; test_case jsonb; ids uuid[] := '{}'; expected uuid[]; found uuid[]; first_page uuid[]; second_page uuid[];
  record_id uuid; last_id uuid; started timestamptz;
begin
  insert into public.usuarios(id,nome,email,senha_hash) values
    (owner_id,'Synthetic search',owner_id||'@example.invalid','synthetic'),
    (other_id,'Synthetic search',other_id||'@example.invalid','synthetic');
  insert into public.vicios(id,usuario_id,nome_vicio,data_inicio) values
    (habit_id,owner_id,'Synthetic corpus','2026-01-01'),(year_habit,owner_id,'Synthetic year','2026-01-01'),
    (foreign_habit,other_id,'Synthetic foreign','2026-01-01');
  for row in select value from jsonb_array_elements(corpus->'rows') loop
    insert into public.registros_diarios(vicio_id,data_registro,humor,gatilhos,conquistas,observacoes)
      values(habit_id,'2026-10-04',row->>'humor',row->>'gatilhos',row->>'conquistas',row->>'observacoes') returning id into record_id;
    ids := array_append(ids,record_id);
  end loop;
  insert into public.registros_diarios(vicio_id,data_registro,humor) values(foreign_habit,'2026-10-04','ÓTIMO');
  update public.vicios set ativo=false where id=habit_id;
  for test_case in select value from jsonb_array_elements(corpus->'cases') loop
    select coalesce(array_agg(ids[value::integer+1] order by ids[value::integer+1] desc),'{}'::uuid[])
      into expected from jsonb_array_elements_text(test_case->'matches');
    select coalesce(array_agg(id order by data_registro desc,id desc),'{}'::uuid[]) into found
      from public.search_diary_records(owner_id,test_case->>'term',habit_id,null,null,101);
    if found is distinct from expected then raise exception 'Common corpus mismatch'; end if;
  end loop;
  if exists(select 1 from public.search_diary_records(other_id,'',habit_id,null,null,101)) then raise exception 'Foreign ownership accepted'; end if;
  if exists(select 1 from public.search_diary_records(owner_id,'',foreign_habit,null,null,101)) then raise exception 'Foreign habit accepted'; end if;
  if exists(select 1 from public.search_diary_records(owner_id,repeat('a',101),habit_id,null,null,101)) then raise exception 'Overlong search accepted'; end if;
  if exists(select 1 from public.search_diary_records(owner_id,'',habit_id,'2026-01-01','2026-01-02',101)) then raise exception 'Period ignored'; end if;
  select array_agg(id order by data_registro desc,id desc) into first_page
    from public.search_diary_records(owner_id,'',habit_id,null,null,2);
  last_id := first_page[2];
  select array_agg(id order by data_registro desc,id desc) into second_page
    from public.search_diary_records(owner_id,'',habit_id,null,null,2,'2026-10-04',last_id);
  select array_agg(id order by id desc) into expected from unnest(ids) id;
  if first_page || second_page is distinct from expected then raise exception 'Tied cursor order/coverage mismatch'; end if;
  select array_agg(id order by data_registro desc,id desc) into found
    from public.list_diary_records(owner_id,habit_id,'2026-01-01','2026-12-31',101);
  if found is distinct from expected then raise exception 'Empty search differs from GET'; end if;
  insert into public.registros_diarios(vicio_id,data_registro,humor,observacoes)
    select year_habit,'2026-01-01'::date+n,'bom',case when n=0 then 'ação anual sintética' else 'registro sintético' end from generate_series(0,364) n;
  started := clock_timestamp();
  select array_agg(id) into found from public.search_diary_records(owner_id,'ACAO',year_habit,null,null,20);
  if cardinality(found) <> 1 then raise exception 'Full year search missed older result'; end if;
  if clock_timestamp()-started > interval '2 seconds' then raise exception 'Synthetic year exceeded 2 seconds'; end if;
  if exists(select 1 from public.search_diary_records(owner_id,repeat('😀',100),year_habit,null,null,20)) then raise exception 'Unicode boundary mismatch'; end if;
  if has_function_privilege('anon','public.search_diary_records(uuid,text,uuid,date,date,integer,date,uuid)','execute')
    or has_function_privilege('authenticated','public.search_diary_records(uuid,text,uuid,date,date,integer,date,uuid)','execute')
    or not has_function_privilege('service_role','public.search_diary_records(uuid,text,uuid,date,date,integer,date,uuid)','execute')
    or has_function_privilege('anon','public.normalize_diary_search(text)','execute') then raise exception 'Search function permissions mismatch'; end if;
  if (select prosecdef from pg_proc where oid='public.search_diary_records(uuid,text,uuid,date,date,integer,date,uuid)'::regprocedure) then raise exception 'Search must use invoker permissions'; end if;
  perform set_config('role','service_role',true);
  perform public.search_diary_records(owner_id,'',habit_id,null,null,20);
  perform set_config('role','none',true);
  perform public.delete_revive_account(owner_id); perform public.delete_revive_account(other_id);
end;
$verify$;
rollback;`;
}
module.exports = { diarySearchSql };
