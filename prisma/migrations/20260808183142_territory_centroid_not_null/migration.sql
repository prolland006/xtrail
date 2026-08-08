/*
  Warnings:

  - Made the column `center_lat` on table `territories` required. This step will fail if there are existing NULL values in that column.
  - Made the column `center_lng` on table `territories` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "territories" ALTER COLUMN "center_lat" SET NOT NULL,
ALTER COLUMN "center_lng" SET NOT NULL;
