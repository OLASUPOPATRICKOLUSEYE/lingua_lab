CREATE TABLE "live_session_attendance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"live_session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"checked_in" boolean DEFAULT false NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_session_attendance_session_student_unique" UNIQUE("live_session_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "live_session_attendance" ADD CONSTRAINT "live_session_attendance_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_attendance" ADD CONSTRAINT "live_session_attendance_live_session_id_live_sessions_id_fk" FOREIGN KEY ("live_session_id") REFERENCES "public"."live_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_session_attendance" ADD CONSTRAINT "live_session_attendance_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;