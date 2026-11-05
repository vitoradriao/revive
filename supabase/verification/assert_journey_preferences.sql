do $$ begin
  if to_regclass('public.journey_preferences') is null
     or not (select relrowsecurity from pg_class where oid='public.journey_preferences'::regclass)
     or has_table_privilege('anon','public.journey_preferences','SELECT')
     or has_table_privilege('authenticated','public.journey_preferences','UPDATE')
     or not has_function_privilege('service_role','public.edit_journey_preferences(uuid,integer,jsonb)','EXECUTE')
     or has_function_privilege('anon','public.edit_journey_preferences(uuid,integer,jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.edit_journey_preferences(uuid,integer,jsonb)','EXECUTE') then
    raise exception 'Unsafe journey preferences schema';
  end if;
  if exists(select 1 from public.journey_preferences) then
    raise exception 'Fresh/legacy migration must not invent account configuration';
  end if;
end $$;
