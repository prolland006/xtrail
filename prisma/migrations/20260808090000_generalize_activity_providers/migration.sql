-- Generalizes external-provider concepts (previously Strava-only) so a second provider
-- (Garmin, Coros, ...) can be added later without reshaping these tables again.
-- Hand-written (not `prisma migrate dev` auto-diff): the auto-diff would DROP strava_accounts
-- and the strava_id column outright, losing real data. Every step below preserves existing
-- rows via backfill, matching the pattern already used in
-- 20260808080958_add_strava_sync_jobs_and_activity_updated_at.

-- CreateEnum
CREATE TYPE "ActivityProvider" AS ENUM ('strava');
CREATE TYPE "ActivitySyncAspect" AS ENUM ('create', 'update', 'delete');
CREATE TYPE "ActivitySyncJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- ============================================================================
-- activities: strava_id (bigint) -> provider (enum) + provider_activity_id (text)
-- ============================================================================
ALTER TABLE "activities" ADD COLUMN "provider" "ActivityProvider";
ALTER TABLE "activities" ADD COLUMN "provider_activity_id" TEXT;

UPDATE "activities" SET "provider" = 'strava', "provider_activity_id" = "strava_id"::text;

ALTER TABLE "activities" ALTER COLUMN "provider" SET NOT NULL;
ALTER TABLE "activities" ALTER COLUMN "provider_activity_id" SET NOT NULL;

DROP INDEX "activities_strava_id_key";
ALTER TABLE "activities" DROP COLUMN "strava_id";

CREATE UNIQUE INDEX "activities_provider_provider_activity_id_key" ON "activities"("provider", "provider_activity_id");

-- ============================================================================
-- strava_accounts -> external_connections (1:1 with player -> 1 row per (player, provider))
-- ============================================================================
ALTER TABLE "strava_accounts" RENAME TO "external_connections";
ALTER TABLE "external_connections" RENAME CONSTRAINT "strava_accounts_player_id_fkey" TO "external_connections_player_id_fkey";

ALTER TABLE "external_connections" ADD COLUMN "provider" "ActivityProvider";
ALTER TABLE "external_connections" ADD COLUMN "external_account_id" TEXT;

UPDATE "external_connections" SET "provider" = 'strava', "external_account_id" = "strava_athlete_id"::text;

ALTER TABLE "external_connections" ALTER COLUMN "provider" SET NOT NULL;
ALTER TABLE "external_connections" ALTER COLUMN "external_account_id" SET NOT NULL;

DROP INDEX "strava_accounts_player_id_key";
DROP INDEX "strava_accounts_strava_athlete_id_key";
ALTER TABLE "external_connections" DROP COLUMN "strava_athlete_id";

CREATE UNIQUE INDEX "external_connections_player_id_provider_key" ON "external_connections"("player_id", "provider");
CREATE UNIQUE INDEX "external_connections_provider_external_account_id_key" ON "external_connections"("provider", "external_account_id");

-- ============================================================================
-- strava_sync_jobs -> activity_sync_jobs (adds provider, generalizes id columns + enums)
-- ============================================================================
ALTER TABLE "strava_sync_jobs" RENAME TO "activity_sync_jobs";

-- Must run before the strava_activity_id column is dropped below: Postgres auto-drops any
-- index that references a column once that column is dropped, so doing this later would find
-- the index already gone.
DROP INDEX "strava_sync_jobs_strava_activity_id_event_type_event_time_key";

ALTER TABLE "activity_sync_jobs" ADD COLUMN "provider" "ActivityProvider";
UPDATE "activity_sync_jobs" SET "provider" = 'strava';
ALTER TABLE "activity_sync_jobs" ALTER COLUMN "provider" SET NOT NULL;

ALTER TABLE "activity_sync_jobs" ADD COLUMN "provider_activity_id" TEXT;
UPDATE "activity_sync_jobs" SET "provider_activity_id" = "strava_activity_id"::text;
ALTER TABLE "activity_sync_jobs" ALTER COLUMN "provider_activity_id" SET NOT NULL;
ALTER TABLE "activity_sync_jobs" DROP COLUMN "strava_activity_id";

ALTER TABLE "activity_sync_jobs" ADD COLUMN "external_account_id" TEXT;
UPDATE "activity_sync_jobs" SET "external_account_id" = "strava_athlete_id"::text;
ALTER TABLE "activity_sync_jobs" ALTER COLUMN "external_account_id" SET NOT NULL;
ALTER TABLE "activity_sync_jobs" DROP COLUMN "strava_athlete_id";

ALTER TABLE "activity_sync_jobs"
  ALTER COLUMN "event_type" TYPE "ActivitySyncAspect" USING ("event_type"::text::"ActivitySyncAspect");

ALTER TABLE "activity_sync_jobs" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "activity_sync_jobs"
  ALTER COLUMN "status" TYPE "ActivitySyncJobStatus" USING ("status"::text::"ActivitySyncJobStatus");
ALTER TABLE "activity_sync_jobs" ALTER COLUMN "status" SET DEFAULT 'pending';

DROP INDEX "strava_sync_jobs_status_created_at_idx";

CREATE UNIQUE INDEX "activity_sync_jobs_provider_event_key" ON "activity_sync_jobs"("provider", "provider_activity_id", "event_type", "event_time");
CREATE INDEX "activity_sync_jobs_status_created_at_idx" ON "activity_sync_jobs"("status", "created_at");

-- Old per-provider enum types are no longer referenced by any column.
DROP TYPE "StravaWebhookAspect";
DROP TYPE "StravaSyncJobStatus";
