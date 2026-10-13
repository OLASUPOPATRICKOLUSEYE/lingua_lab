CREATE TABLE "activity_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"activity_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"assigned_by" uuid NOT NULL,
	"status" text DEFAULT 'assigned' NOT NULL,
	"due_at" timestamp with time zone,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "activity_assignments_activity_class_unique" UNIQUE("activity_id","class_id"),
	CONSTRAINT "activity_assignments_status_check" CHECK ("activity_assignments"."status" in ('assigned', 'archived')),
	CONSTRAINT "activity_assignments_archived_consistency_check" CHECK (("activity_assignments"."status" = 'archived') = ("activity_assignments"."archived_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_school_slug_unique" UNIQUE("school_id","slug"),
	CONSTRAINT "classes_name_nonempty_check" CHECK (char_length(trim("classes"."name")) > 0),
	CONSTRAINT "classes_slug_nonempty_check" CHECK (char_length(trim("classes"."slug")) > 0)
);
--> statement-breakpoint
CREATE TABLE "class_memberships" (
	"class_id" uuid NOT NULL,
	"school_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "class_memberships_class_id_student_id_pk" PRIMARY KEY("class_id","student_id")
);
--> statement-breakpoint
ALTER TABLE "activity_assignments" ADD CONSTRAINT "activity_assignments_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_assignments" ADD CONSTRAINT "activity_assignments_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_assignments" ADD CONSTRAINT "activity_assignments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_assignments" ADD CONSTRAINT "activity_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_memberships" ADD CONSTRAINT "class_memberships_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;