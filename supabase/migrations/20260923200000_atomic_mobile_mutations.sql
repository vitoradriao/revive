-- Keep the idempotency receipt for as long as the owning account exists. A
-- queued operation can be replayed months later after an old APK is reopened.
alter table public.api_idempotency
  alter column expires_at set default 'infinity'::timestamptz;

comment on column public.api_idempotency.expires_at is
  'Compatibility column; mutation receipts are retained until account deletion to prevent a delayed queue replay from duplicating data.';

create or replace function public.execute_mobile_mutation(
  p_usuario_id uuid,
  p_idempotency_key uuid,
  p_request_hash text,
  p_legacy_request_hash text,
  p_operation text,
  p_payload jsonb,
  p_request_id text
)
returns table(status_code integer, response_body jsonb)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.api_idempotency%rowtype;
  v_inserted integer;
  v_status integer;
  v_body jsonb;
  v_addiction public.vicios%rowtype;
  v_goal public.metas%rowtype;
  v_record public.registros_diarios%rowtype;
  v_relapse public.historico_recaidas%rowtype;
  v_addiction_id uuid;
  v_date date;
  v_event_time timestamptz;
  v_base_time timestamptz;
  v_lost_days integer;
  v_days integer;
  v_description text;
  v_days_goal integer;
  v_value_goal numeric;
  v_start_today boolean;
begin
  insert into public.api_idempotency
    (usuario_id, idempotency_key, request_hash, expires_at)
  values
    (p_usuario_id, p_idempotency_key, p_request_hash, 'infinity'::timestamptz)
  on conflict (usuario_id, idempotency_key) do nothing;
  get diagnostics v_inserted = row_count;

  select * into v_receipt from public.api_idempotency
   where usuario_id = p_usuario_id and idempotency_key = p_idempotency_key
   for update;

  if v_inserted = 0 then
    if v_receipt.request_hash not in (p_request_hash, p_legacy_request_hash) then
      return query select 409, jsonb_build_object(
        'codigo', 'IDEMPOTENCY_CONFLITO',
        'mensagem', 'A chave ja foi usada com outro conteudo.',
        'request_id', p_request_id);
      return;
    end if;
    if v_receipt.status_code is not null and v_receipt.response_body is not null then
      return query select v_receipt.status_code, v_receipt.response_body;
      return;
    end if;
    return query select 409, jsonb_build_object(
      'codigo', 'IDEMPOTENCY_EM_PROCESSAMENTO',
      'mensagem', 'Operacao ainda em processamento.',
      'request_id', p_request_id);
    return;
  end if;

  if p_operation = 'record.create' then
    begin
      v_addiction_id := nullif(btrim(p_payload->>'vicio_id'), '')::uuid;
    exception when invalid_text_representation then
      v_addiction_id := null;
    end;
    if v_addiction_id is null or coalesce(p_payload->>'data_registro', '') !~ '^\d{4}-\d{2}-\d{2}$' then
      v_status := 422;
      v_body := jsonb_build_object('codigo', 'DADOS_INVALIDOS', 'mensagem', 'Vicio e data valida sao obrigatorios.', 'request_id', p_request_id);
    else
      begin
        v_date := (p_payload->>'data_registro')::date;
      exception when others then
        v_date := null;
      end;
      if v_date is null or to_char(v_date, 'YYYY-MM-DD') <> p_payload->>'data_registro' then
        v_status := 422;
        v_body := jsonb_build_object('codigo', 'DADOS_INVALIDOS', 'mensagem', 'Vicio e data valida sao obrigatorios.', 'request_id', p_request_id);
      elsif v_date > (now() at time zone 'UTC')::date + 1 then
        v_status := 422;
        v_body := jsonb_build_object('codigo', 'DATA_FUTURA', 'mensagem', 'A data do registro nao pode estar no futuro.', 'request_id', p_request_id);
      else
        select * into v_addiction from public.vicios
         where id = v_addiction_id and usuario_id = p_usuario_id;
        if not found then
          v_status := 404;
          v_body := jsonb_build_object('codigo', 'VICIO_NAO_ENCONTRADO', 'mensagem', 'Vicio nao encontrado.', 'request_id', p_request_id);
        else
          insert into public.registros_diarios(vicio_id, data_registro, humor, gatilhos, conquistas, observacoes)
          values (v_addiction_id, v_date,
            nullif(left(btrim(p_payload->>'humor'), 100), ''),
            nullif(left(btrim(p_payload->>'gatilhos'), 500), ''),
            nullif(left(btrim(p_payload->>'conquistas'), 500), ''),
            nullif(left(btrim(p_payload->>'observacoes'), 1000), ''))
          returning * into v_record;
          v_status := 201;
          v_body := jsonb_build_object('mensagem', 'Registro criado com sucesso', 'registro', to_jsonb(v_record));
        end if;
      end if;
    end if;

  elsif p_operation = 'relapse.create' then
    begin
      v_addiction_id := nullif(btrim(p_payload->>'addictionId'), '')::uuid;
      v_event_time := coalesce(nullif(btrim(p_payload->>'occurred_at'), '')::timestamptz, now());
    exception when others then
      v_addiction_id := null;
      v_event_time := null;
    end;
    if v_addiction_id is null or v_event_time is null or not isfinite(v_event_time)
       or v_event_time > now() + interval '5 minutes' then
      v_status := 422;
      v_body := jsonb_build_object('codigo', 'DATA_INVALIDA', 'mensagem', 'Momento da recaida invalido.', 'request_id', p_request_id);
    else
      select * into v_addiction from public.vicios
       where id = v_addiction_id and usuario_id = p_usuario_id
       for update;
      if not found then
        v_status := 404;
        v_body := jsonb_build_object('codigo', 'VICIO_NAO_ENCONTRADO', 'mensagem', 'Vicio nao encontrado.', 'request_id', p_request_id);
      else
        v_base_time := coalesce(v_addiction.data_ultima_recaida, v_addiction.data_inicio)::timestamptz;
        v_lost_days := greatest(0, floor(extract(epoch from (v_event_time - v_base_time)) / 86400)::integer);
        insert into public.historico_recaidas(vicio_id, data_recaida, motivo, dias_abstinencia_perdidos)
        values (v_addiction.id, v_event_time, nullif(left(btrim(p_payload->>'motivo'), 1000), ''), v_lost_days)
        returning * into v_relapse;
        if p_payload->'resetarContador' = 'true'::jsonb then
          update public.vicios set data_ultima_recaida = v_event_time
           where id = v_addiction.id and usuario_id = p_usuario_id
          returning * into v_addiction;
        end if;
        v_status := 201;
        v_body := jsonb_build_object('mensagem', 'Recaida registrada.',
          'dias_abstinencia_anteriores', v_lost_days,
          'recaida', to_jsonb(v_relapse), 'vicio', to_jsonb(v_addiction));
      end if;
    end if;

  elsif p_operation = 'goal.create' then
    v_description := nullif(btrim(p_payload->>'descricao_meta'), '');
    begin
      v_addiction_id := nullif(btrim(p_payload->>'vicio_id'), '')::uuid;
      v_days_goal := nullif(p_payload->>'dias_objetivo', '')::numeric::integer;
      v_value_goal := nullif(p_payload->>'valor_objetivo', '')::numeric;
    exception when others then
      v_addiction_id := null;
      v_days_goal := null;
      v_value_goal := null;
    end;
    if v_description is null or length(v_description) > 240 or v_addiction_id is null then
      v_status := 422;
      v_body := jsonb_build_object('codigo', 'DADOS_INVALIDOS', 'mensagem', 'Descricao e vicio sao obrigatorios.', 'request_id', p_request_id);
    elsif (nullif(p_payload->>'dias_objetivo', '') is not null and (v_days_goal is null or v_days_goal <= 0))
       or (nullif(p_payload->>'valor_objetivo', '') is not null and (v_value_goal is null or v_value_goal <= 0)) then
      v_status := 422;
      v_body := jsonb_build_object('codigo', 'OBJETIVO_INVALIDO', 'mensagem', 'Objetivos devem ser numeros positivos.', 'request_id', p_request_id);
    else
      select * into v_addiction from public.vicios
       where id = v_addiction_id and usuario_id = p_usuario_id;
      if not found then
        v_status := 404;
        v_body := jsonb_build_object('codigo', 'VICIO_NAO_ENCONTRADO', 'mensagem', 'Vicio nao encontrado.', 'request_id', p_request_id);
      else
        v_start_today := p_payload->'iniciar_hoje' = 'true'::jsonb;
        v_days := greatest(0, floor(extract(epoch from (now() - coalesce(v_addiction.data_ultima_recaida, v_addiction.data_inicio)::timestamptz)) / 86400)::integer);
        insert into public.metas(usuario_id, vicio_id, descricao_meta, dias_objetivo, valor_objetivo,
          iniciar_hoje, data_inicio_meta, dias_abstinencia_inicio, valor_economizado_inicio)
        values (p_usuario_id, v_addiction_id, v_description, v_days_goal, v_value_goal,
          v_start_today,
          case when v_start_today then coalesce(nullif(p_payload->>'data_inicio_meta', '')::date, (now() at time zone 'UTC')::date) else null end,
          case when v_start_today then v_days else 0 end,
          case when v_start_today then round(v_days * coalesce(v_addiction.valor_economizado_por_dia, 0), 2) else 0 end)
        returning * into v_goal;
        v_status := 201;
        v_body := jsonb_build_object('mensagem', 'Meta criada com sucesso', 'meta', to_jsonb(v_goal));
      end if;
    end if;

  elsif p_operation = 'goal.complete' then
    begin
      v_addiction_id := nullif(btrim(p_payload->>'goalId'), '')::uuid;
    exception when invalid_text_representation then
      v_addiction_id := null;
    end;
    if jsonb_typeof(p_payload->'concluida') is distinct from 'boolean' then
      v_status := 422;
      v_body := jsonb_build_object('codigo', 'DADOS_INVALIDOS', 'mensagem', 'Status de conclusao invalido.', 'request_id', p_request_id);
    elsif v_addiction_id is null then
      v_status := 404;
      v_body := jsonb_build_object('codigo', 'META_NAO_ENCONTRADA', 'mensagem', 'Meta nao encontrada.', 'request_id', p_request_id);
    else
      update public.metas set concluida = (p_payload->>'concluida')::boolean
       where id = v_addiction_id and usuario_id = p_usuario_id
      returning * into v_goal;
      if not found then
        v_status := 404;
        v_body := jsonb_build_object('codigo', 'META_NAO_ENCONTRADA', 'mensagem', 'Meta nao encontrada.', 'request_id', p_request_id);
      else
        v_status := 200;
        v_body := jsonb_build_object('mensagem', 'Meta atualizada com sucesso', 'meta', to_jsonb(v_goal));
      end if;
    end if;
  else
    raise exception 'Unsupported mobile mutation type';
  end if;

  update public.api_idempotency set status_code = v_status, response_body = v_body
   where usuario_id = p_usuario_id and idempotency_key = p_idempotency_key;
  return query select v_status, v_body;
end;
$$;

revoke all on function public.execute_mobile_mutation(uuid, uuid, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.execute_mobile_mutation(uuid, uuid, text, text, text, jsonb, text)
  to service_role;
