-- AlterTable
ALTER TABLE "activity_hexagons" ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "duration_seconds" DOUBLE PRECISION;
