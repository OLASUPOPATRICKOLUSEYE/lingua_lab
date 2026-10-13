-- RLS: live_sessions. Tenant isolation on school_id.
-- Intra-tenant scoping (a student only sees sessions for classes they are
-- enrolled in) is enforced at the application layer, same as assignments.

alter table public.live_sessions enable row level security;
alter table public.live_sessions force row level security;

drop policy if exists live_sessions_tenant_isolation on public.live_sessions;
create policy live_sessions_tenant_isolation
  on public.live_sessions
  for all
  to authenticated
  using (auth.jwt() ->> 'school_id' = school_id::text)
  with check (auth.jwt() ->> 'school_id' = school_id::text);
