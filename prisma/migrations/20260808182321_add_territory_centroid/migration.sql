/*
  Warnings:

  - Added the required column `center_lat` to the `territories` table without a default value. This is not possible if the table is not empty.
  - Added the required column `center_lng` to the `territories` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "activity_sync_jobs" RENAME CONSTRAINT "strava_sync_jobs_pkey" TO "activity_sync_jobs_pkey";

-- AlterTable
ALTER TABLE "external_connections" RENAME CONSTRAINT "strava_accounts_pkey" TO "external_connections_pkey";

-- AlterTable
-- Nullable for now: center_lat/center_lng are derived from h3Index via h3-js, which can't be
-- expressed in plain SQL. A one-off script (scripts/backfillTerritoryCentroids.ts) backfills
-- existing rows immediately after this migration runs; a follow-up migration then sets both
-- columns NOT NULL once the backfill has completed.
ALTER TABLE "territories" ADD COLUMN     "center_lat" DOUBLE PRECISION,
ADD COLUMN     "center_lng" DOUBLE PRECISION;

-- CreateIndex
CREATE INDEX "territories_center_lat_center_lng_idx" ON "territories"("center_lat", "center_lng");

-- RenameIndex
ALTER INDEX "activity_sync_jobs_provider_event_key" RENAME TO "activity_sync_jobs_provider_provider_activity_id_event_type_key";
