-- RLS: submissions. Tenant isolation on school_id. submissions are append-only
-- (AGENTS.md rule #1) — the app never issues UPDATEs — but the policy still
-- covers UPDATE/DELETE so a compromised query cannot mutate cross-tenant rows
-- even if the no-UPDATE discipline were violated.

alter table public.submissions enable row level security;
alter table public.submissions force row level security;

drop policy if exists submissions_tenant_isolation on public.submissions;
create policy submissions_tenant_isolation
  on public.submissions
  for all
  to authenticated
  using (
    auth.jwt() ->> 'school_id' = school_id::text
    and (
      auth.jwt() ->> 'role' in ('system_admin', 'dept_head')
      or (
        auth.jwt() ->> 'role' = 'student'
        and student_id = (auth.jwt() ->> 'sub')::uuid
      )
      or (
        auth.jwt() ->> 'role' = 'teacher'
        and (
          -- (a) the teacher authored the activity, or
          exists (
            select 1
            from public.activities a
            where a.id = public.submissions.activity_id
              and a.school_id = public.submissions.school_id
              and a.teacher_id = (auth.jwt() ->> 'sub')::uuid
          )
          -- (b) the teacher teaches the class this submission was assigned to.
          -- Without (b), a mission created by an ADMIN and assigned to a
          -- teacher's class was invisible to that teacher at the DATABASE
          -- level: their review queue came back empty and no application-layer
          -- change could recover the rows. Scoped through the assignment frozen
          -- on the submission, not the student's current memberships, so moving
          -- a student between classes never changes who could grade past work.
          or exists (
            select 1
            from public.activity_assignments aa
            join public.classes c on c.id = aa.class_id
            where aa.id = public.submissions.assignment_id
              and c.school_id = public.submissions.school_id
              and c.teacher_id = (auth.jwt() ->> 'sub')::uuid
          )
        )
      )
    )
  )
  with check (
    auth.jwt() ->> 'school_id' = school_id::text
    and (
      auth.jwt() ->> 'role' in ('system_admin', 'dept_head')
      or (
        auth.jwt() ->> 'role' = 'student'
        and student_id = (auth.jwt() ->> 'sub')::uuid
      )
    )
  );
