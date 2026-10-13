-- activities.reference_video_path — optional teacher reference VIDEO, powering
-- the side-by-side mouth comparison. Additive and nullable (existing activities
-- have none); independent of reference_audio_path.
ALTER TABLE "activities" ADD COLUMN "reference_video_path" text;