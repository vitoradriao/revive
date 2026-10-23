-- Exercitado em instalação nova e upgrade legado, sem modificar a fixture durável.
begin;
do $$
declare
  v_owner uuid := gen_random_uuid();
  v_habit uuid := gen_random_uuid();
  v_result jsonb;
  v_receipt uuid := gen_random_uuid();
  v_reason text := repeat(chr(128512), 1000);
begin
  insert into public.usuarios(id,nome,email,senha_hash)
    values(v_owner,'Synthetic private migration',v_owner::text || '@example.invalid','synthetic');
  insert into public.vicios(id,usuario_id,nome_vicio,data_inicio,valor_economizado_por_dia)
    values(v_habit,v_owner,'Synthetic habit',(now() at time zone 'UTC')::date,10);
  if (select motivo_pessoal is not null from public.vicios where id=v_habit) then
    raise exception 'Personal reason must start null';
  end if;
  if public.normalize_personal_reason(U&'\FEFF\0020\0009\00A0\3000') is not null
     or public.normalize_personal_reason(E'  line\r\nnext\rfinal  ') <> E'line\nnext\nfinal' then
    raise exception 'Personal reason normalization differs';
  end if;
  v_result := public.edit_revive_habit(v_owner,v_habit,1,jsonb_build_object('motivo_pessoal',v_reason));
  if (v_result->>'status')::integer <> 200 or length(v_result->'vicio'->>'motivo_pessoal') <> 1000 then
    raise exception 'Personal reason Unicode boundary rejected';
  end if;
  perform * from public.execute_mobile_mutation(v_owner,v_receipt,'synthetic','synthetic','relapse.create',
    jsonb_build_object('addictionId',v_habit,'resetarContador',false),v_owner::text);
  if exists(select 1 from public.api_idempotency where usuario_id=v_owner and idempotency_key=v_receipt
    and response_body->'vicio' ? 'motivo_pessoal') then
    raise exception 'Personal reason duplicated into idempotency receipt';
  end if;
  v_result := public.edit_revive_habit(v_owner,v_habit,2,'{"ativo":false}'::jsonb);
  if (v_result->>'status')::integer <> 200 or (v_result->'vicio'->>'motivo_pessoal') is distinct from v_reason then
    raise exception 'Old client or archive erased personal reason';
  end if;
  v_result := public.edit_revive_habit(v_owner,v_habit,3,jsonb_build_object('motivo_pessoal',v_reason || chr(128512)));
  if (v_result->>'status')::integer <> 422 then raise exception 'Personal reason limit not enforced'; end if;
  v_result := public.edit_revive_habit(v_owner,v_habit,2,'{"motivo_pessoal":null}'::jsonb);
  if (v_result->>'status')::integer <> 409 then raise exception 'Personal reason stale revision accepted'; end if;
  v_result := public.edit_revive_habit(gen_random_uuid(),v_habit,3,'{"motivo_pessoal":null}'::jsonb);
  if (v_result->>'status')::integer <> 404 then raise exception 'Personal reason foreign write accepted'; end if;
  v_result := public.edit_revive_habit(v_owner,v_habit,3,jsonb_build_object('motivo_pessoal',E' \t\n'));
  if (v_result->>'status')::integer <> 200 or v_result->'vicio'->'motivo_pessoal' <> 'null'::jsonb then
    raise exception 'Personal reason empty removal failed on archived habit';
  end if;
  delete from public.usuarios where id=v_owner;
  if exists(select 1 from public.vicios where id=v_habit) then raise exception 'Personal reason account cascade failed'; end if;
end $$;
rollback;
