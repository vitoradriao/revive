begin;
-- Legacy text is preserved. New clients and PATCH validate sizes rather than truncate it.
alter table public.registros_diarios alter column humor type varchar(100);
alter table public.registros_diarios add column revision integer not null default 1 check (revision > 0);
alter table public.registros_diarios add column updated_at timestamptz not null default now();
create index diary_records_page on public.registros_diarios(vicio_id,data_registro desc,id desc);
create function public.revise_diary_record() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.vicio_id is distinct from old.vicio_id or new.data_registro is distinct from old.data_registro then
    raise exception 'Diary date and habit are immutable';
  end if;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.revise_diary_record() from public,anon,authenticated;
create trigger diary_record_revision before update on public.registros_diarios for each row execute function public.revise_diary_record();
create or replace function public.execute_diary_record_update(
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
  v_record public.registros_diarios%rowtype;
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


  if p_operation <> 'record.update' then raise exception 'Unsupported diary mutation'; end if;
  select r.* into v_record from public.registros_diarios r
    join public.vicios h on h.id = r.vicio_id
    where r.id = (p_payload->>'recordId')::uuid and h.usuario_id = p_usuario_id
    for update of r;
  if not found then
    v_status := 404;
    v_body := jsonb_build_object('codigo','REGISTRO_NAO_ENCONTRADO','mensagem','Registro não encontrado.');
  elsif v_record.revision <> (p_payload->>'expected_version')::integer then
    v_status := 409;
    v_body := jsonb_build_object('codigo','REVISAO_CONFLITO','mensagem','O registro mudou em outro dispositivo. Seu texto local foi preservado.');
  elsif exists (select 1 from jsonb_object_keys(p_payload) k where k not in ('recordId','expected_version','humor','gatilhos','conquistas','observacoes'))
    or not (p_payload ?| array['humor','gatilhos','conquistas','observacoes'])
    or exists (select 1 from jsonb_each(p_payload) e where e.key in ('humor','gatilhos','conquistas','observacoes')
      and (jsonb_typeof(e.value) not in ('string','null') or length(e.value #>> '{}') > case e.key when 'humor' then 100 when 'observacoes' then 1000 else 500 end)) then
    v_status := 422;
    v_body := jsonb_build_object('codigo','DADOS_INVALIDOS','mensagem','Revise os campos do registro.');
  else
    update public.registros_diarios r set
      humor = case when p_payload ? 'humor' then p_payload->>'humor' else r.humor end,
      gatilhos = case when p_payload ? 'gatilhos' then p_payload->>'gatilhos' else r.gatilhos end,
      conquistas = case when p_payload ? 'conquistas' then p_payload->>'conquistas' else r.conquistas end,
      observacoes = case when p_payload ? 'observacoes' then p_payload->>'observacoes' else r.observacoes end
      where r.id = v_record.id returning * into v_record;
    v_status := 200;
    v_body := jsonb_build_object('registro',to_jsonb(v_record));
  end if;
  update public.api_idempotency set status_code = v_status, response_body = v_body
    where usuario_id = p_usuario_id and idempotency_key = p_idempotency_key;
  return query select v_status, v_body;
end;
$$;
revoke all on function public.execute_diary_record_update(uuid,uuid,text,text,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.execute_diary_record_update(uuid,uuid,text,text,text,jsonb,text) to service_role;

create function public.list_diary_records(p_usuario_id uuid, p_vicio_id uuid, p_inicio date, p_fim date,
  p_limit integer, p_cursor_date date default null, p_cursor_id uuid default null)
returns setof public.registros_diarios language sql stable security definer set search_path = '' as $$
  select r.* from public.registros_diarios r join public.vicios h on h.id = r.vicio_id
    where h.usuario_id = p_usuario_id and (p_vicio_id is null or r.vicio_id = p_vicio_id)
      and r.data_registro between p_inicio and p_fim
      and (p_cursor_date is null or (r.data_registro,r.id) < (p_cursor_date,p_cursor_id))
    order by r.data_registro desc,r.id desc limit greatest(1,least(p_limit,101));
$$;
revoke all on function public.list_diary_records(uuid,uuid,date,date,integer,date,uuid) from public,anon,authenticated;
grant execute on function public.list_diary_records(uuid,uuid,date,date,integer,date,uuid) to service_role;
commit;
