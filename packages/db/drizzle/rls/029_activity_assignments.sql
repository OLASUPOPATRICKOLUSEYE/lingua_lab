-- RLS: activity_assignments. Tenant isolation on school_id.

alter table public.activity_assignments enable row level security;
alter table public.activity_assignments force row level security;

drop policy if exists activity_assignments_tenant_isolation on public.activity_assignments;
create policy activity_assignments_tenant_isolation
  on public.activity_assignments
  for all
  to authenticated
  using (auth.jwt() ->> 'school_id' = school_id::text)
  with check (auth.jwt() ->> 'school_id' = school_id::text);
