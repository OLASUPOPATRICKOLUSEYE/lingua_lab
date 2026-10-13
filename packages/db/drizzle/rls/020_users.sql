-- RLS: users. A user can only see/act on rows within their own school
-- (school_id = JWT claim). Canonical policy form from data-model.md:
-- `auth.jwt() ->> 'school_id' = school_id::text`.

alter table public.users enable row level security;
alter table public.users force row level security;

drop policy if exists users_tenant_isolation on public.users;
create policy users_tenant_isolation
  on public.users
  for all
  to authenticated
  using (auth.jwt() ->> 'school_id' = school_id::text)
  with check (auth.jwt() ->> 'school_id' = school_id::text);
