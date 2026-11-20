begin;
create function public.synthetic_delete_failure() returns trigger language plpgsql as $$
begin raise exception 'synthetic deletion failure'; end;
$$;
create trigger synthetic_delete_failure before delete on public.vicios
for each row execute function public.synthetic_delete_failure();
do $$
declare u uuid := gen_random_uuid(); h uuid := gen_random_uuid(); k uuid := gen_random_uuid();
begin
 insert into public.usuarios(id,nome,email,senha_hash) values(u,'Synthetic','retention-'||u||'@example.invalid','synthetic');
 insert into public.vicios(id,usuario_id,nome_vicio,data_inicio) values(h,u,'Synthetic',now());
 insert into public.metas(usuario_id,vicio_id,descricao_meta) values(u,h,'Synthetic');
 insert into public.api_idempotency(usuario_id,idempotency_key,request_hash,status_code,response_body,created_at,expires_at)
 values(u,k,'hash',201,'{"observacoes":"sensitive synthetic text"}',now()-interval '31 days','infinity');
 perform public.purge_expired_receipt_payloads();
 if not exists(select 1 from public.api_idempotency where usuario_id=u and idempotency_key=k and status_code=410
 and response_body->>'codigo'='RECIBO_EXPIRADO' and expires_at < now()) then raise exception 'Retention failed'; end if;
 insert into public.api_idempotency(usuario_id,idempotency_key,request_hash) values(u,k,'hash') on conflict do nothing;
 if (select status_code from public.api_idempotency where usuario_id=u and idempotency_key=k) <> 410 then raise exception 'Replay tombstone lost'; end if;
 if public.delete_revive_habit(gen_random_uuid(),h) then raise exception 'Cross-account deletion'; end if;
 if not exists(select 1 from public.metas where vicio_id=h) then raise exception 'Wrong-account mutation'; end if;
 begin
   perform public.delete_revive_habit(u,h);
   raise exception 'Expected injected deletion failure';
 exception when raise_exception then
   if sqlerrm <> 'synthetic deletion failure' then raise; end if;
 end;
 if not exists(select 1 from public.metas where vicio_id=h) then raise exception 'Rollback lost goal'; end if;
 if not exists(select 1 from public.vicios where id=h) then raise exception 'Rollback lost habit'; end if;
 execute 'drop trigger synthetic_delete_failure on public.vicios';
 if not public.delete_revive_habit(u,h) then raise exception 'Deletion failed'; end if;
 if exists(select 1 from public.metas where vicio_id=h) or exists(select 1 from public.vicios where id=h) then raise exception 'Partial deletion'; end if;
end;
$$;
rollback;
