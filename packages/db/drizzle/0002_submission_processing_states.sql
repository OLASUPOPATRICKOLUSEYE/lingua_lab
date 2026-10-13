CREATE TABLE "submission_processing_states" (
	"submission_id" uuid PRIMARY KEY NOT NULL,
	"school_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"processed_path" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submission_processing_states" ADD CONSTRAINT "submission_processing_states_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "submission_processing_states" ADD CONSTRAINT "submission_processing_states_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "submission_processing_states" ("submission_id", "school_id", "status", "processed_path")
SELECT "id", "school_id", "status", "processed_path"
FROM "submissions"
ON CONFLICT ("submission_id") DO NOTHING;
