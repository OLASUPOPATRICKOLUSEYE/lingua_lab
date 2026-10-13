CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"head_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "departments_school_slug_unique" UNIQUE("school_id","slug"),
	CONSTRAINT "departments_name_nonempty_check" CHECK (char_length(trim("departments"."name")) > 0),
	CONSTRAINT "departments_slug_nonempty_check" CHECK (char_length(trim("departments"."slug")) > 0)
);
--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_head_id_users_id_fk" FOREIGN KEY ("head_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;