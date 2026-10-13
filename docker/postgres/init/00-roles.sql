-- Runs once on first container start (postgres docker-entrypoint-initdb.d).
-- Creates the same role model the app expects: a privileged migration role and
-- a non-privileged, non-BYPASSRLS application role. Mirrors
-- packages/db/drizzle/rls/000_bootstrap.sql so RLS behaves identically to the
-- local Homebrew cluster and to managed Supabase.
--
-- The `lingua_admin` superuser is provided by POSTGRES_USER in compose; here we
-- add the app role + the `authenticated` role the app switches into per request.

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

grant authenticated to lingua_app;
grant connect on database lingua_lab to lingua_app, authenticated;
grant usage on schema public to authenticated;

-- auth.jwt() / auth.uid() shims (Supabase-compatible). The full definitions
-- live in packages/db/drizzle/rls/000_bootstrap.sql and are re-applied by
-- `pnpm rls:apply` after migrations; this minimal copy lets the DB answer
-- policy checks even before the app's rls:apply step runs.
create schema if not exists auth;

create or replace function auth.jwt()
returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;

grant usage on schema auth to authenticated;
grant execute on function auth.jwt() to authenticated;
