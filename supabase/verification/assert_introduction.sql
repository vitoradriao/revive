begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); h uuid := gen_random_uuid(); result jsonb;
begin
  insert into public.usuarios(id,nome,email,senha_hash) values(a,'Synthetic',a||'@example.invalid','synthetic'),(b,'Synthetic',b||'@example.invalid','synthetic');
  insert into public.vicios(id,usuario_id,nome_vicio,data_inicio) values(h,a,'Synthetic',current_date);
  insert into public.journey_preferences(usuario_id) values(b);
  result := public.edit_journey_preferences(a,0,'{"intro":{"version":1,"state":"pending","step":"habit"}}');
  if result->>'status' <> '200' then raise exception 'Introduction start failed'; end if;
  result := public.edit_journey_preferences(b,0,jsonb_build_object('intro',jsonb_build_object('version',1,'state','pending','step','reason','habit_id',h)));
  if result->>'status' <> '422' then raise exception 'Introduction foreign ownership accepted'; end if;
  begin
    update public.journey_preferences set intro=jsonb_build_object('version',1,'state','pending','step','reason','habit_id',h) where usuario_id=b;
    raise exception 'Introduction direct ownership accepted';
  exception when foreign_key_violation then null; end;
  result := public.edit_journey_preferences(a,1,jsonb_build_object('intro',jsonb_build_object('version',1,'state','pending','step','reason','habit_id',h)));
  if result->>'status' <> '200' or result#>>'{preferences,intro,habit_id}' <> h::text then raise exception 'Introduction habit checkpoint failed'; end if;
  result := public.edit_journey_preferences(a,1,'{"intro":{"version":1,"state":"dismissed"}}');
  if result->>'status' <> '409' then raise exception 'Introduction stale revision accepted'; end if;
  update public.vicios set ativo=false where id=h;
  result := public.edit_journey_preferences(a,2,jsonb_build_object('intro',jsonb_build_object('version',1,'state','pending','step','checkin','habit_id',h)));
  if result->>'status' <> '200' then raise exception 'Introduction archive lost progress'; end if;
  delete from public.vicios where id=h;
  result := public.edit_journey_preferences(a,3,jsonb_build_object('intro',jsonb_build_object('version',1,'state','completed','step','checkin','habit_id',h)));
  if result->>'status' <> '200' then raise exception 'Introduction tombstone lost progress'; end if;
  for result in select value from jsonb_array_elements('[{"version":0,"state":"pending","step":"habit"},{"version":1,"state":"pending","step":"checkin"},{"version":1,"state":"pending","step":"reason","habit_id":null},{"version":1,"state":"pending","step":"habit","private":"invalid"}]') loop
    if public.edit_journey_preferences(a,4,jsonb_build_object('intro',result))->>'status' <> '422' then raise exception 'Invalid introduction accepted'; end if;
  end loop;
  result := public.edit_journey_preferences(a,4,'{"indicator_order":["future_metric"]}');
  if result#>>'{preferences,intro,state}' <> 'completed' or result#>>'{preferences,intro,habit_id}' <> h::text then raise exception 'Unrelated preference lost introduction'; end if;
  if (select intro->>'version' from public.journey_preferences where usuario_id=b) <> '0' then raise exception 'Introduction account isolation failed'; end if;
end $$;
rollback;
