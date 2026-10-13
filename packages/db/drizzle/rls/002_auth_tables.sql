-- auth_credentials/sessions/password_reset_tokens are the deliberate
-- exception to "every table gets RLS" (Iron Law 1 applies to school_id
-- tables; these structurally aren't one — a login has to be resolvable
-- before there are any claims to scope by). Granted directly to `lingua_app`,
-- bypassing the `authenticated`-role/withClaims() indirection every other
-- table goes through, since these are read outside of any tenant-scoped
-- transaction. Idempotent.

grant select, insert, update, delete on
  public.auth_credentials,
  public.sessions,
  public.password_reset_tokens
to lingua_app;
