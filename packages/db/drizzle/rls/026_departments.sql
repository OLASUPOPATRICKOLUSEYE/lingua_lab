-- RLS: departments. Tenant isolation on school_id.

alter table public.departments enable row level security;
alter table public.departments force row level security;

drop policy if exists departments_tenant_isolation on public.departments;
create policy departments_tenant_isolation
  on public.departments
  for all
  to authenticated
  using (auth.jwt() ->> 'school_id' = school_id::text)
  with check (auth.jwt() ->> 'school_id' = school_id::text);
