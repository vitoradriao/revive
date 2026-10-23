-- Run after all incremental migrations in the disposable legacy fixture DB.
-- The transaction tests account deletion and rolls it back to preserve evidence.
begin;
do $$
declare
  test_user constant uuid := '00000000-0000-4000-8000-000000000101';
  test_vicio constant uuid := '00000000-0000-4000-8000-000000000201';
  anchor_count integer;
  period_count integer;
  economy_count integer;
  award_count integer;
begin
  if not exists (select 1 from public.usuarios where id=test_user and credential_version=0) then
    raise exception 'Legacy credentials must start at version zero without changing the account';
  end if;
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

  if (select resetar_contador from public.historico_recaidas
      where id = '00000000-0000-4000-8000-000000000401') is not null
     or not exists (select 1 from public.progresso_ancoras
                    where vicio_id = test_vicio and cobertura = 'unknown')
     or not exists (select 1 from public.progresso_periodos
                    where vicio_id = test_vicio and source = 'legacy_anchor'
                      and cobertura = 'unknown' and ended_at is null)
     or exists (select 1 from public.progresso_periodos
                where vicio_id = test_vicio and source = 'mobile_reset') then
    raise exception 'Legacy relapse intent must remain unknown without inventing a reset';
  end if;
  if not exists (select 1 from public.segmentos_economia
                 where vicio_id = test_vicio and origem = 'legacy_backfill'
                   and cobertura = 'inferred' and valor_diario = 12.50)
     or not exists (select 1 from public.conquistas_permanentes
                    where vicio_id = test_vicio and categoria = 'streak'
                      and valor_alvo = 1 and awarded_at = '2026-01-02 12:00:00+00'
                      and origem = 'legacy' and cobertura = 'confirmed') then
    raise exception 'Legacy economy or saved milestone was not conservatively preserved';
  end if;

  -- Re-running the backfill blocks must not duplicate any legacy row.
  insert into public.progresso_ancoras (vicio_id, started_at, cobertura)
  select id, coalesce(data_ultima_recaida, data_inicio) at time zone 'UTC',
         case when data_ultima_recaida is not null then 'inferred'
              when exists (select 1 from public.historico_recaidas relapse
                           where relapse.vicio_id = vicios.id and relapse.resetar_contador is null)
                then 'unknown'
              else 'confirmed' end
    from public.vicios where id = test_vicio
  on conflict (vicio_id) do nothing;
  insert into public.segmentos_economia
    (vicio_id, effective_from, valor_diario, cobertura, origem)
  select id, data_inicio at time zone 'UTC', valor_economizado_por_dia,
         'inferred', 'legacy_backfill'
    from public.vicios where id = test_vicio
  on conflict do nothing;
  insert into public.conquistas_permanentes
    (usuario_id, vicio_id, categoria, valor_alvo, awarded_at, origem, cobertura)
  select v.usuario_id, m.vicio_id, 'streak', m.dias_abstinencia,
         m.data_marco at time zone 'UTC', 'legacy', 'confirmed'
    from public.marcos m join public.vicios v on v.id = m.vicio_id
   where m.vicio_id = test_vicio and m.dias_abstinencia > 0
  on conflict (usuario_id, vicio_id, categoria, valor_alvo) do nothing;
  select count(*) into anchor_count from public.progresso_ancoras where vicio_id = test_vicio;
  select count(*) into period_count from public.progresso_periodos where vicio_id = test_vicio;
  select count(*) into economy_count from public.segmentos_economia where vicio_id = test_vicio;
  select count(*) into award_count from public.conquistas_permanentes where vicio_id = test_vicio;
  if anchor_count <> 1 or period_count <> 1 or economy_count <> 1 or award_count <> 1 then
    raise exception 'Legacy backfill replay duplicated progress rows';
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
     or exists (select 1 from public.device_push_tokens where usuario_id = test_user)
     or exists (select 1 from public.progresso_ancoras where vicio_id = test_vicio)
     or exists (select 1 from public.progresso_periodos where vicio_id = test_vicio)
     or exists (select 1 from public.segmentos_economia where vicio_id = test_vicio)
     or exists (select 1 from public.conquistas_permanentes where usuario_id = test_user) then
    raise exception 'Account deletion left owned rows behind';
  end if;
  raise notice 'Synthetic legacy rows survived migration; account deletion cascades';
end;
$$;
rollback;

-- Upgrade aditivo: motivos de hábitos anteriores começam nulos.
do $$ begin
  if exists(select 1 from public.vicios where motivo_pessoal is not null) then
    raise exception 'Personal reason upgrade must preserve old habits without content';
  end if;
end $$;
