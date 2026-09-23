-- Run after all incremental migrations in the disposable legacy fixture DB.
-- The transaction tests account deletion and rolls it back to preserve evidence.
begin;
do $$
declare
  test_user constant uuid := '00000000-0000-4000-8000-000000000101';
  test_vicio constant uuid := '00000000-0000-4000-8000-000000000201';
begin
  if not exists (select 1 from public.usuarios where id = test_user)
     or not exists (select 1 from public.vicios where id = test_vicio and usuario_id = test_user)
     or not exists (select 1 from public.registros_diarios
                    where id = '00000000-0000-4000-8000-000000000301' and vicio_id = test_vicio)
     or not exists (select 1 from public.historico_recaidas
                    where id = '00000000-0000-4000-8000-000000000401' and vicio_id = test_vicio)
     or not exists (select 1 from public.metas
                    where id = '00000000-0000-4000-8000-000000000501'
                      and usuario_id = test_user and vicio_id = test_vicio)
     or not exists (select 1 from public.marcos
                    where id = '00000000-0000-4000-8000-000000000701' and vicio_id = test_vicio)
     or not exists (select 1 from public.mensagens_motivacionais
                    where id = '00000000-0000-4000-8000-000000000601') then
    raise exception 'Synthetic legacy data was lost or relationships changed';
  end if;

  if not exists (select 1 from public.metas
                 where id = '00000000-0000-4000-8000-000000000501'
                   and iniciar_hoje = false and dias_abstinencia_inicio = 0
                   and valor_economizado_inicio = 0) then
    raise exception 'Goal progress defaults were not backfilled';
  end if;

  insert into public.app_sessions
    (usuario_id, refresh_token_hash, family_id, expires_at)
  values (test_user, 'synthetic-refresh-hash', gen_random_uuid(), now() + interval '1 day');
  insert into public.api_idempotency
    (usuario_id, idempotency_key, request_hash)
  values (test_user, gen_random_uuid(), 'synthetic-request-hash');
  insert into public.device_push_tokens
    (usuario_id, expo_push_token, platform)
  values (test_user, 'ExponentPushToken[syntheticfixture]', 'android');

  perform public.delete_revive_account(test_user);
  if exists (select 1 from public.usuarios where id = test_user)
     or exists (select 1 from public.vicios where usuario_id = test_user)
     or exists (select 1 from public.metas where usuario_id = test_user)
     or exists (select 1 from public.marcos where vicio_id = test_vicio)
     or exists (select 1 from public.registros_diarios where vicio_id = test_vicio)
     or exists (select 1 from public.historico_recaidas where vicio_id = test_vicio)
     or exists (select 1 from public.app_sessions where usuario_id = test_user)
     or exists (select 1 from public.api_idempotency where usuario_id = test_user)
     or exists (select 1 from public.device_push_tokens where usuario_id = test_user) then
    raise exception 'Account deletion left owned rows behind';
  end if;
  raise notice 'Synthetic legacy rows survived migration; account deletion cascades';
end;
$$;
rollback;
