begin;

create function public.delete_revive_habit(p_usuario_id uuid, p_vicio_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  perform 1 from public.vicios where id = p_vicio_id and usuario_id = p_usuario_id for update;
  if not found then return false; end if;
  delete from public.metas where vicio_id = p_vicio_id and usuario_id = p_usuario_id;
  delete from public.vicios where id = p_vicio_id and usuario_id = p_usuario_id;
  return true;
end;
$$;
revoke all on function public.delete_revive_habit(uuid,uuid) from public,anon,authenticated;
grant execute on function public.delete_revive_habit(uuid,uuid) to service_role;

-- Retain the key/hash tombstone to prevent a delayed offline action being applied twice.
-- Only the response payload expires; an expired replay receives an explicit terminal 410.
alter table public.api_idempotency alter column expires_at set default (now() + interval '30 days');
update public.api_idempotency set expires_at = created_at + interval '30 days'
 where expires_at > created_at + interval '30 days';

create function public.purge_expired_receipt_payloads()
returns void language sql security invoker set search_path = '' as $$
  update public.api_idempotency
     set status_code = 410, response_body = '{"codigo":"RECIBO_EXPIRADO","mensagem":"O prazo de consulta desta operação terminou. Atualize o histórico antes de decidir outra ação."}'::jsonb
   where expires_at <= now() and status_code is distinct from 410;
  delete from public.password_recovery_limits where window_at < now() - interval '2 days';
$$;
revoke all on function public.purge_expired_receipt_payloads() from public,anon,authenticated;
grant execute on function public.purge_expired_receipt_payloads() to service_role;

create function public.limit_receipt_retention()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.expires_at := least(coalesce(new.expires_at, now() + interval '30 days'), new.created_at + interval '30 days');
  -- Runs even before ON CONFLICT, so an old key never exposes its expired payload.
  update public.api_idempotency set status_code=410,
    response_body='{"codigo":"RECIBO_EXPIRADO","mensagem":"O prazo de consulta desta operação terminou. Atualize o histórico antes de decidir outra ação."}'::jsonb
    where usuario_id=new.usuario_id and expires_at <= now() and status_code is distinct from 410;
  return new;
end;
$$;
revoke all on function public.limit_receipt_retention() from public,anon,authenticated;
create trigger api_idempotency_limit_retention before insert on public.api_idempotency
for each row execute function public.limit_receipt_retention();
select public.purge_expired_receipt_payloads();
commit;
