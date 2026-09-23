-- Access tokens remain short lived, but every protected request also checks
-- that its owning server session is still active. Refresh rotation is serialized
-- on the source row so concurrent use follows one deterministic replay policy.
create or replace function public.rotate_mobile_session(
  p_refresh_token_hash text,
  p_replacement_id uuid,
  p_replacement_hash text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_session public.app_sessions%rowtype;
  account public.usuarios%rowtype;
  now_at timestamptz := clock_timestamp();
begin
  select * into current_session
    from public.app_sessions
    where refresh_token_hash = p_refresh_token_hash
    for update;

  if not found then return jsonb_build_object('status', 'invalid'); end if;

  if current_session.revoked_at is not null then
    if current_session.replaced_by is not null then
      update public.app_sessions set revoked_at = now_at
        where family_id = current_session.family_id and revoked_at is null;
      return jsonb_build_object('status', 'reused');
    end if;
    return jsonb_build_object('status', 'invalid');
  end if;

  if current_session.expires_at <= now_at then
    update public.app_sessions set revoked_at = now_at where id = current_session.id;
    return jsonb_build_object('status', 'expired');
  end if;

  select * into account from public.usuarios where id = current_session.usuario_id;
  if not found then return jsonb_build_object('status', 'invalid'); end if;

  insert into public.app_sessions
    (id, usuario_id, refresh_token_hash, family_id, expires_at, user_agent)
  values
    (p_replacement_id, current_session.usuario_id, p_replacement_hash,
     current_session.family_id, now_at + interval '30 days', p_user_agent);

  update public.app_sessions
    set revoked_at = now_at, replaced_by = p_replacement_id, last_used_at = now_at
    where id = current_session.id;

  return jsonb_build_object(
    'status', 'rotated', 'usuario_id', account.id, 'nome', account.nome, 'email', account.email
  );
end;
$$;

revoke all on function public.rotate_mobile_session(text, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.rotate_mobile_session(text, uuid, text, text)
  to service_role;

comment on function public.rotate_mobile_session(text, uuid, text, text) is
  'Atomically consumes a refresh token and creates its replacement; reuse of a rotated token revokes the active family.';

create or replace function public.revoke_mobile_sessions_after_password_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.senha_hash is distinct from old.senha_hash then
    update public.app_sessions
      set revoked_at = clock_timestamp()
      where usuario_id = new.id and revoked_at is null;
  end if;
  return new;
end;
$$;

revoke all on function public.revoke_mobile_sessions_after_password_change()
  from public, anon, authenticated;

drop trigger if exists revoke_mobile_sessions_on_password_change on public.usuarios;
create trigger revoke_mobile_sessions_on_password_change
  after update of senha_hash on public.usuarios
  for each row execute function public.revoke_mobile_sessions_after_password_change();

comment on function public.revoke_mobile_sessions_after_password_change() is
  'Revokes all mobile sessions atomically with a password hash change.';
