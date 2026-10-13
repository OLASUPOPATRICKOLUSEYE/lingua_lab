-- session_lookup_by_token_hash: resolves a session token to (id, role) before
-- any tenant claims exist — same reasoning as login_lookup_by_email
-- (003_login_lookup.sql). Used by both the middleware-safe session check
-- and the Server Component/Action session check, since both need to read
-- `users` through `sessions` before RLS claims can be set.
drop function if exists public.session_lookup_by_token_hash(text);
create or replace function public.session_lookup_by_token_hash(p_token_hash text)
returns table (id uuid, email text, school_id uuid, role text)
language sql
security definer
set search_path = public
as $$
  select u.id, u.email, u.school_id, u.role
  from public.sessions s
  join public.users u on u.id = s.user_id
  where s.token_hash = p_token_hash
    and s.expires_at > now()
  limit 1;
$$;

revoke all on function public.session_lookup_by_token_hash(text) from public;
grant execute on function public.session_lookup_by_token_hash(text) to lingua_app;
