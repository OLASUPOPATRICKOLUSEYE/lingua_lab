-- RLS: submission_processing_states. Tenant isolation on school_id, with the
-- same role-aware submission visibility as the parent row.

alter table public.submission_processing_states enable row level security;
alter table public.submission_processing_states force row level security;

drop policy if exists submission_processing_states_tenant_isolation
  on public.submission_processing_states;
create policy submission_processing_states_tenant_isolation
  on public.submission_processing_states
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
          where s.id = public.submission_processing_states.submission_id
            and s.school_id = public.submission_processing_states.school_id
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
          where s.id = public.submission_processing_states.submission_id
            and s.school_id = public.submission_processing_states.school_id
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
          where s.id = public.submission_processing_states.submission_id
            and s.school_id = public.submission_processing_states.school_id
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
          where s.id = public.submission_processing_states.submission_id
            and s.school_id = public.submission_processing_states.school_id
            and a.teacher_id = (auth.jwt() ->> 'sub')::uuid
        )
      )
    )
  );
