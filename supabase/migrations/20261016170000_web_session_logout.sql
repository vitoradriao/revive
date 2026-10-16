begin;

-- Serialize cookie logout with refresh/password changes using the account lock.
-- A stale cookie still identifies its family, but reveals no session/account data.
create or replace function public.revoke_mobile_session_family(p_refresh_token_hash text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  target_family uuid;
begin
  select usuario_id into owner_id from public.app_sessions
    where refresh_token_hash = p_refresh_token_hash;
  if not found then return jsonb_build_object('status', 'revoked'); end if;
  perform 1 from public.usuarios where id = owner_id for update;
  if not found then return jsonb_build_object('status', 'revoked'); end if;
  select family_id into target_family from public.app_sessions
    where refresh_token_hash = p_refresh_token_hash and usuario_id = owner_id;
  if found then
    update public.app_sessions set revoked_at = clock_timestamp()
      where usuario_id = owner_id and family_id = target_family and revoked_at is null;
  end if;
  return jsonb_build_object('status', 'revoked');
end;
$$;
revoke all on function public.revoke_mobile_session_family(text) from public, anon, authenticated;
grant execute on function public.revoke_mobile_session_family(text) to service_role;
comment on function public.revoke_mobile_session_family(text) is
  'Revokes a cookie session family under the same account lock as refresh rotation; available only to the API.';
commit;
