ALTER TABLE "grading_results"
ADD COLUMN "override_justification" text,
ADD COLUMN "reviewed_by" uuid;
--> statement-breakpoint
ALTER TABLE "grading_results"
ADD CONSTRAINT "grading_results_reviewed_by_users_id_fk"
FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id")
ON DELETE no action ON UPDATE no action;
