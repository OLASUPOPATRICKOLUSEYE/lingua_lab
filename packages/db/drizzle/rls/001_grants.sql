-- Table privileges for the `authenticated` role. RLS only constrains rows a
-- role can already touch — without these GRANTs the role has no access at all,
-- which would mask (not prove) policy correctness. Applied after the schema
-- migration, before the per-table policies. Idempotent.

grant usage on schema public to authenticated;

grant select, insert, update, delete on
  public.schools,
  public.activities,
  public.activity_assignments,
  public.classes,
  public.class_memberships,
  public.departments,
  public.live_sessions,
  public.live_session_attendance,
  public.users,
  public.submissions,
  public.submission_processing_states,
  public.grading_results
to authenticated;
