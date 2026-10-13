ALTER TABLE "live_sessions" DROP CONSTRAINT "live_sessions_join_url_https_check";--> statement-breakpoint
ALTER TABLE "live_sessions" DROP CONSTRAINT "live_sessions_provider_check";--> statement-breakpoint
ALTER TABLE "live_sessions" ALTER COLUMN "join_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_join_url_check" CHECK (("live_sessions"."provider" = 'in_person' and "live_sessions"."join_url" is null)
          or ("live_sessions"."provider" <> 'in_person' and "live_sessions"."join_url" like 'https://%'));--> statement-breakpoint
ALTER TABLE "live_sessions" ADD CONSTRAINT "live_sessions_provider_check" CHECK ("live_sessions"."provider" in ('zoom', 'google_meet', 'in_person'));