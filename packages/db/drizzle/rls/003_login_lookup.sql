-- login_lookup_by_email: lets the login flow resolve identity (id, role)
-- by email BEFORE any tenant claims exist — same reasoning as
-- auth_credentials/sessions being pre-auth exceptions (002_auth_tables.sql).
-- Unlike those, `users` itself stays RLS-protected for every other access
-- path; this is a narrow, single-purpose exception via SECURITY DEFINER,
-- scoped to exactly the columns login needs. Never returns password_hash —
-- that stays in auth_credentials regardless.
create or replace function public.login_lookup_by_email(p_email text)
returns table (id uuid, role text)
language sql
security definer
set search_path = public
as $$
  select id, role
  from public.users
  where email = p_email
  limit 1;
$$;

revoke all on function public.login_lookup_by_email(text) from public;
grant execute on function public.login_lookup_by_email(text) to lingua_app;