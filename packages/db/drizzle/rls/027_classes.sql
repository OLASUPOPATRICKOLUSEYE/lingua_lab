-- RLS: classes. Tenant isolation on school_id.

alter table public.classes enable row level security;
alter table public.classes force row level security;

drop policy if exists classes_tenant_isolation on public.classes;
create policy classes_tenant_isolation
  on public.classes
  for all
  to authenticated
  using (auth.jwt() ->> 'school_id' = school_id::text)
  with check (auth.jwt() ->> 'school_id' = school_id::text);
