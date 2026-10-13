-- RLS: live_session_attendance. Tenant isolation on school_id.

alter table public.live_session_attendance enable row level security;
alter table public.live_session_attendance force row level security;

drop policy if exists live_session_attendance_tenant_isolation on public.live_session_attendance;
create policy live_session_attendance_tenant_isolation
  on public.live_session_attendance
  for all
  to authenticated
  using (auth.jwt() ->> 'school_id' = school_id::text)
  with check (auth.jwt() ->> 'school_id' = school_id::text);
