-- Bootstrap: roles + Supabase-compatible auth shims.
-- Applied by the privileged admin role BEFORE schema migrations and RLS
-- policies. On managed Supabase, the `authenticated` role and `auth.jwt()`
-- already exist — this file recreates the minimal equivalents for local dev so
-- RLS behaves identically on both. Idempotent.

-- The non-privileged role the application connects as. NOT a superuser and
-- explicitly NOBYPASSRLS — this is the role whose queries RLS must constrain.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'lingua_app') then
    create role lingua_app login password 'lingua_app' noinherit nobypassrls;
  end if;
end
$$;

-- lingua_app assumes the `authenticated` role at connection time (the app sets
-- `set role authenticated`); grant membership so it can.
grant authenticated to lingua_app;

-- Supabase exposes request JWT claims under `auth`. Recreate the helpers our
-- policies use: auth.jwt() returns the claims json, auth.uid() the subject.
create schema if not exists auth;

create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;

grant usage on schema auth to authenticated;
grant execute on function auth.jwt() to authenticated;
grant execute on function auth.uid() to authenticated;
