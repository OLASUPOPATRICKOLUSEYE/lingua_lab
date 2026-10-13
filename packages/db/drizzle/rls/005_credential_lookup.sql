-- Mediated credential read for the login path.
--
-- BACKGROUND. auth_credentials, sessions, and password_reset_tokens carry no
-- school_id and must be readable before any tenant claims exist, so RLS is off
-- by design. The consequence is that they hold password hashes and session
-- tokens with no policy backstop, while `lingua_app` holds broad grants.
--
-- This function narrows that: login no longer SELECTs the table directly, it
-- calls a SECURITY DEFINER function — the same pattern as 003_login_lookup and
-- 004_session_lookup.
--
-- WHAT THIS FILE DELIBERATELY DOES NOT DO: revoke SELECT.
--
-- An earlier version revoked `select` on auth_credentials and sessions. That is
-- wrong, and it broke logout in a running app. Postgres requires SELECT on any
-- column referenced in a WHERE clause or an ON CONFLICT target, so revoking it
-- breaks writes that never appear in a grep for `.select()`:
--
--   * destroySession()  -> DELETE FROM sessions WHERE token_hash = $1
--   * destroyAllSessionsForUser() -> DELETE FROM sessions WHERE user_id = $1
--   * password reset    -> INSERT ... ON CONFLICT (user_id) DO UPDATE
--
-- All three were verified to fail with "permission denied" under the revoke.
-- Closing the read path properly means routing those writes through definer
-- functions too; until that is done, revoking SELECT trades a real outage for a
-- defence-in-depth gain. Do not re-add the revokes without mediating the three
-- writes above AND exercising logout and password reset against them.

drop function if exists public.credential_hash_for_user(uuid);
create or replace function public.credential_hash_for_user(p_user_id uuid)
returns text
language sql
security definer
set search_path = public
as $$
  select c.password_hash
  from public.auth_credentials c
  where c.user_id = p_user_id
  limit 1;
$$;

revoke all on function public.credential_hash_for_user(uuid) from public;
grant execute on function public.credential_hash_for_user(uuid) to lingua_app;
