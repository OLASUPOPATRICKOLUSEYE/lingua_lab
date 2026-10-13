CREATE TABLE "live_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"join_url" text NOT NULL,
	"title" text,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"canceled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_sessions_provider_check" CHECK ("live_sessions"."provider" in ('zoom', 'google_meet')),
	CONSTRAINT "live_sessions_time_order_check" CHECK ("live_sessions"."ends_at" > "live_sessions"."starts_at"),
	CONSTRAINT "live_sessions_join_url_https_check" CHECK ("live_sessions"."join_url" like 'https://%')
);
--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;