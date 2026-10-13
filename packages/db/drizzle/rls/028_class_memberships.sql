-- RLS: class_memberships. Tenant isolation on school_id.

alter table public.class_memberships enable row level security;
alter table public.class_memberships force row level security;

drop policy if exists class_memberships_tenant_isolation on public.class_memberships;
create policy class_memberships_tenant_isolation
  on public.class_memberships
  for all
  to authenticated
  using (auth.jwt() ->> 'school_id' = school_id::text)
  with check (auth.jwt() ->> 'school_id' = school_id::text);
