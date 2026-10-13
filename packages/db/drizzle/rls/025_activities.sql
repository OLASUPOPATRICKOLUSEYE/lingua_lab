-- RLS: activities. Tenant isolation on school_id, with role-aware visibility:
-- admins/dept heads can see all tenant activities, teachers only their own,
-- students only class-assigned activities.

alter table public.activities enable row level security;
alter table public.activities force row level security;

drop policy if exists activities_tenant_isolation on public.activities;
create policy activities_tenant_isolation
  on public.activities
  for all
  to authenticated
  using (
    auth.jwt() ->> 'school_id' = school_id::text
    and (
      auth.jwt() ->> 'role' in ('system_admin', 'dept_head')
      or (
        auth.jwt() ->> 'role' = 'teacher'
        and teacher_id = (auth.jwt() ->> 'sub')::uuid
      )
      or (
        auth.jwt() ->> 'role' = 'student'
        and exists (
          select 1
          from public.activity_assignments aa
          join public.class_memberships cm
            on cm.class_id = aa.class_id
           and cm.school_id = aa.school_id
          where aa.activity_id = public.activities.id
            and aa.school_id = public.activities.school_id
            and aa.status = 'assigned'
            and cm.student_id = (auth.jwt() ->> 'sub')::uuid
        )
      )
    )
  )
  with check (
    auth.jwt() ->> 'school_id' = school_id::text
    and (
      auth.jwt() ->> 'role' in ('system_admin', 'dept_head')
      or (
        auth.jwt() ->> 'role' = 'teacher'
        and teacher_id = (auth.jwt() ->> 'sub')::uuid
      )
    )
  );
