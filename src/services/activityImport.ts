import { prisma } from "@/lib/db";
import { decodePolyline } from "@/lib/polyline";
import { hexagonsForRoute, resolutionForDiameterMeters } from "@/lib/h3";
import { HEX_DIAMETER_METERS } from "@/config/h3";
import { updateTerritoriesForHexagons } from "./territory";
import type { NormalizedActivity } from "@/lib/normalizedActivity";
import type { ActivityProvider } from "@prisma/client";

export type ImportResult =
  | { status: "already-imported"; activityId: number }
  | { status: "imported"; activityId: number; hexagonCount: number };

/**
 * Processes one already-normalized activity for a player, regardless of which provider it
 * came from:
 *   save Activity -> decode polyline -> compute H3 hexagons -> save ActivityHexagon rows
 *   -> recompute only the territories those hexagons belong to.
 *
 * Idempotent: (provider, providerActivityId) is unique, so re-processing an already-imported
 * activity is a no-op rather than a duplicate or an error — safe to call repeatedly (e.g. once
 * per page load, or from a future daily cron) without extra bookkeeping by the caller.
 */
export async function importNormalizedActivity(
  playerId: number,
  provider: ActivityProvider,
  normalized: NormalizedActivity
): Promise<ImportResult> {
  const existing = await prisma.activity.findUnique({
    where: { providerActivity: { provider, providerActivityId: normalized.providerActivityId } },
    select: { id: true },
  });
  if (existing) {
    return { status: "already-imported", activityId: existing.id };
  }

  const resolution = resolutionForDiameterMeters(HEX_DIAMETER_METERS);
  const visits = normalized.polyline
    ? hexagonsForRoute(
        decodePolyline(normalized.polyline).map(([lat, lng]) => [lng, lat] as [number, number]),
        resolution
      )
    : [];

  const activity = await prisma.$transaction(async (tx) => {
    const created = await tx.activity.create({
      data: {
        provider,
        providerActivityId: normalized.providerActivityId,
        playerId,
        name: normalized.name,
        type: normalized.type,
        startDate: normalized.startDate,
        distanceMeters: normalized.distanceMeters,
        movingTimeSeconds: normalized.movingTimeSeconds,
        elevationGainMeters: normalized.elevationGainMeters,
        polyline: normalized.polyline,
      },
    });

    if (visits.length > 0) {
      // Not upsert: activityId is brand new (just created above), so every row here is
      // guaranteed new — createMany is the cheaper option for what can be 50-200+ rows.
      await tx.activityHexagon.createMany({
        data: visits.map((visit) => ({
          activityId: created.id,
          playerId,
          h3Index: visit.h3Index,
          distanceMeters: visit.distanceMeters,
        })),
      });
    }

    return created;
  });

  // Outside the write transaction: recomputing territories issues one query per affected
  // hexagon in parallel (see updateTerritoriesForHexagons), which needs its own connections
  // rather than sharing the single reserved connection an interactive transaction holds.
  if (visits.length > 0) {
    await updateTerritoriesForHexagons(visits.map((visit) => visit.h3Index));
  }

  return { status: "imported", activityId: activity.id, hexagonCount: visits.length };
}

export type UpdateResult = { status: "updated" | "not-found" };

/**
 * Applies a provider "update" webhook event to an already-imported activity. Providers fire
 * this for metadata changes (rename, sport type, privacy) — never for a GPS re-record — so
 * this deliberately only touches name/type and leaves distance/elevation/polyline/hexagons
 * alone: territories must never be recomputed off the back of a metadata-only change.
 */
export async function updateActivityMetadata(
  provider: ActivityProvider,
  providerActivityId: string,
  fields: Pick<NormalizedActivity, "name" | "type">
): Promise<UpdateResult> {
  const result = await prisma.activity.updateMany({
    where: { provider, providerActivityId },
    data: { name: fields.name, type: fields.type },
  });

  return { status: result.count > 0 ? "updated" : "not-found" };
}

export type DeleteResult = { status: "deleted" | "not-found" };

/**
 * Applies a provider "delete" webhook event (also used when a create/update fetch finds the
 * activity is already gone). Deleting the Activity row cascades to its ActivityHexagon rows
 * (see schema); the hexagons that lose a visit here are exactly the ones whose territory
 * ownership might change, so — same as importNormalizedActivity — they're recomputed right
 * after, once the deleting transaction has committed.
 */
export async function deleteActivity(provider: ActivityProvider, providerActivityId: string): Promise<DeleteResult> {
  const existing = await prisma.activity.findUnique({
    where: { providerActivity: { provider, providerActivityId } },
    select: { hexagons: { select: { h3Index: true } } },
  });

  if (!existing) {
    return { status: "not-found" };
  }

  await prisma.activity.delete({ where: { providerActivity: { provider, providerActivityId } } });

  const affectedHexagons = existing.hexagons.map((h) => h.h3Index);
  if (affectedHexagons.length > 0) {
    await updateTerritoriesForHexagons(affectedHexagons);
  }

  return { status: "deleted" };
}
