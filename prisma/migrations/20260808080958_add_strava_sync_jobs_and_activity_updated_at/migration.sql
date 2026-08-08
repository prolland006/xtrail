/*
  Warnings:

  - Added the required column `updated_at` to the `activities` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "StravaWebhookAspect" AS ENUM ('create', 'update', 'delete');

-- CreateEnum
CREATE TYPE "StravaSyncJobStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- AlterTable
-- Backfill existing rows with imported_at (no update event has happened yet for them),
-- then drop the default since @updatedAt is managed by Prisma at the application level.
ALTER TABLE "activities" ADD COLUMN     "updated_at" TIMESTAMP(3);
UPDATE "activities" SET "updated_at" = "imported_at" WHERE "updated_at" IS NULL;
ALTER TABLE "activities" ALTER COLUMN "updated_at" SET NOT NULL;

-- CreateTable
CREATE TABLE "strava_sync_jobs" (
    "id" SERIAL NOT NULL,
    "strava_activity_id" BIGINT NOT NULL,
    "strava_athlete_id" BIGINT NOT NULL,
    "event_type" "StravaWebhookAspect" NOT NULL,
    "event_time" TIMESTAMP(3) NOT NULL,
    "status" "StravaSyncJobStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "strava_sync_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "strava_sync_jobs_status_created_at_idx" ON "strava_sync_jobs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "strava_sync_jobs_strava_activity_id_event_type_event_time_key" ON "strava_sync_jobs"("strava_activity_id", "event_type", "event_time");
