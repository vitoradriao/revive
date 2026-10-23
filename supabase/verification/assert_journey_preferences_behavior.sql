begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); h uuid := gen_random_uuid(); result jsonb;
begin
  insert into public.usuarios(id,nome,email,senha_hash) values(a,'Synthetic',a||'@example.invalid','synthetic'),(b,'Synthetic',b||'@example.invalid','synthetic');
  insert into public.vicios(id,usuario_id,nome_vicio,data_inicio) values(h,a,'Synthetic',current_date);
  result := public.edit_journey_preferences(a,0,'{"indicator_order":["future_metric","current_streak"],"intro":{"version":2,"state":"dismissed"}}');
  if result->>'status' <> '200' or result#>>'{preferences,revision}' <> '1' then raise exception 'Preference default/write failed'; end if;
  result := public.edit_journey_preferences(b,0,jsonb_build_object('primary_habit_id',h));
  if result->>'status' <> '422' then raise exception 'Foreign owner accepted'; end if;
  begin
    update public.journey_preferences set primary_habit_id=h where usuario_id=b;
    raise exception 'Composite FK did not enforce ownership';
  exception when foreign_key_violation then null; end;
  begin
    update public.journey_preferences set indicator_order='[]'::jsonb where usuario_id=a;
    raise exception 'Direct write bypassed order constraint';
  exception when check_violation then null; end;
  result := public.edit_journey_preferences(a,0,'{"primary_habit_id":null}');
  if result->>'status' <> '409' then raise exception 'Stale revision accepted'; end if;
  result := public.edit_journey_preferences(a,1,jsonb_build_object('primary_habit_id',h));
  if result->>'status' <> '200' then raise exception 'Owned principal rejected'; end if;
  update public.vicios set ativo=false where id=h;
  if (select primary_habit_id from public.journey_preferences where usuario_id=a) is distinct from h then raise exception 'Archive lost principal'; end if;
  result := public.edit_journey_preferences(a,2,jsonb_build_object('primary_habit_id',h));
  if result->>'status' <> '422' then raise exception 'Archived principal accepted'; end if;
  delete from public.vicios where id=h;
  if (select primary_habit_id is not null or revision <> 3 from public.journey_preferences where usuario_id=a) then raise exception 'Delete failed to clear reference/bump revision'; end if;
  for result in select value from jsonb_array_elements('[{"indicator_order":[]},{"indicator_order":["a","a"]},{"intro":{"version":0,"state":"completed"}},{"intro":{"x":1,"state":"pending"}}]') loop
    if public.edit_journey_preferences(a,3,result)->>'status' <> '422' then raise exception 'Invalid preferences accepted'; end if;
  end loop;
  result := public.edit_journey_preferences(a,3,'{"indicator_order":["current_streak","historical_record","sequence_savings","accumulated_savings"]}');
  if result->>'status' <> '200' or result#>>'{preferences,intro,version}' <> '2' then raise exception 'Restore/intro preservation failed'; end if;
  perform public.delete_revive_account(a);
  if exists(select 1 from public.journey_preferences where usuario_id=a) then raise exception 'Account cascade failed'; end if;
  if (select revision from public.journey_preferences where usuario_id=b) <> 0 then raise exception 'Other account changed'; end if;
  perform public.delete_revive_account(b);
end $$;
rollback;
