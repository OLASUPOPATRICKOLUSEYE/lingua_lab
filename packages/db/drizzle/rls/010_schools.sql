-- RLS: schools. The tenant root. A user may only see/act on their OWN school
-- row — `id` matched against the JWT's school_id claim. FORCE makes the policy
-- apply even to the table owner, so a migration/admin connection can't silently
-- read across tenants either.

alter table public.schools enable row level security;
alter table public.schools force row level security;

drop policy if exists schools_tenant_isolation on public.schools;
create policy schools_tenant_isolation
  on public.schools
  for all
  to authenticated
  using (auth.jwt() ->> 'school_id' = id::text)
  with check (auth.jwt() ->> 'school_id' = id::text);
