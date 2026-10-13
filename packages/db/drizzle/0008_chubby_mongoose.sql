-- submissions.assignment_id -> activity_assignments(id).
-- Freezes the assignment (and therefore the class) a submission was made
-- against, so teacher review no longer infers class from the student's mutable
-- memberships (which mis-attributes and mutates historical rows — see
-- packages/db/src/rls-tests/submission-class-context.rls.test.ts).
-- Nullable: existing rows predate assignments and stay NULL (the FK is
-- satisfied by NULL, so no NOT VALID / backfill is required here).
ALTER TABLE "submissions" ADD COLUMN "assignment_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assignment_id_activity_assignments_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "public"."activity_assignments"("id") ON DELETE no action ON UPDATE no action;