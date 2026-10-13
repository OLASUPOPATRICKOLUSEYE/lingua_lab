create table "activities" (
	"id" uuid primary key default gen_random_uuid() not null,
	"school_id" uuid not null,
	"teacher_id" uuid not null,
	"title" text not null,
	"prompt" text not null,
	"target_language" text not null,
	"passage_text" text not null,
	"teacher_name" text not null,
	"teacher_reference_text" text not null,
	"coach_note" text,
	"submission_modes" jsonb not null,
	"time_limit_seconds" integer default 90 not null,
	"created_at" timestamp with time zone default now() not null,
	constraint "activities_time_limit_seconds_check" check ("activities"."time_limit_seconds" > 0),
	constraint "activities_submission_modes_nonempty_check" check (jsonb_array_length("activities"."submission_modes") > 0)
);
--> statement-breakpoint
alter table "activities" add constraint "activities_school_id_schools_id_fk" foreign key ("school_id") references "public"."schools"("id") on delete no action on update no action;
--> statement-breakpoint
alter table "activities" add constraint "activities_teacher_id_users_id_fk" foreign key ("teacher_id") references "public"."users"("id") on delete no action on update no action;
