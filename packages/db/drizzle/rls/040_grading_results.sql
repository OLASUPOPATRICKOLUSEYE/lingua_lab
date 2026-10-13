-- RLS: grading_results. Tenant isolation on the denormalized school_id anchor,
-- with role-aware access via the parent submission/activity ownership chain.

alter table public.grading_results enable row level security;
alter table public.grading_results force row level security;

drop policy if exists grading_results_tenant_isolation on public.grading_results;
create policy grading_results_tenant_isolation
  on public.grading_results
  for all
  to authenticated
  using (
    auth.jwt() ->> 'school_id' = school_id::text
    and (
      auth.jwt() ->> 'role' in ('system_admin', 'dept_head')
      or (
        auth.jwt() ->> 'role' = 'student'
        and exists (
          select 1
          from public.submissions s
          where s.id = public.grading_results.submission_id
            and s.school_id = public.grading_results.school_id
            and s.student_id = (auth.jwt() ->> 'sub')::uuid
        )
      )
      or (
        auth.jwt() ->> 'role' = 'teacher'
        -- Mirrors the submissions policy: the teacher either authored the
        -- activity, or teaches the class the submission was assigned to.
        -- Without the second branch a teacher could see an admin-authored
        -- submission but none of its status or grades, which reads as "the
        -- queue is broken" rather than as a permissions rule.
        and exists (
          select 1
          from public.submissions s
          left join public.activities a
            on a.id = s.activity_id
           and a.school_id = s.school_id
          left join public.activity_assignments aa
            on aa.id = s.assignment_id
          left join public.classes c
            on c.id = aa.class_id
           and c.school_id = s.school_id
          where s.id = public.grading_results.submission_id
            and s.school_id = public.grading_results.school_id
            and (
              a.teacher_id = (auth.jwt() ->> 'sub')::uuid
              or c.teacher_id = (auth.jwt() ->> 'sub')::uuid
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
        and exists (
          select 1
          from public.submissions s
          where s.id = public.grading_results.submission_id
            and s.school_id = public.grading_results.school_id
            and s.student_id = (auth.jwt() ->> 'sub')::uuid
        )
      )
      or (
        auth.jwt() ->> 'role' = 'teacher'
        and exists (
          select 1
          from public.submissions s
          join public.activities a
            on a.id = s.activity_id
           and a.school_id = s.school_id
          where s.id = public.grading_results.submission_id
            and s.school_id = public.grading_results.school_id
            and a.teacher_id = (auth.jwt() ->> 'sub')::uuid
        )
      )
    )
  );
