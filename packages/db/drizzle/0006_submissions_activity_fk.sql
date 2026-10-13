-- submissions.activity_id -> activities(id).
-- NOT VALID: rows created before the activities table existed (dev/demo
-- submissions with synthetic fixture UUIDs) are grandfathered; every NEW
-- submission must reference a real activity. Validate later with:
--   ALTER TABLE submissions VALIDATE CONSTRAINT submissions_activity_id_activities_id_fk;
-- once legacy rows are purged or backfilled.
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action NOT VALID;
