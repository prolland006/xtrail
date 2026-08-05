import { prisma } from "@/lib/db";
import { decodePolyline } from "@/lib/polyline";
import { hexagonsForRoute, resolutionForDiameterMeters } from "@/lib/h3";
import { HEX_DIAMETER_METERS } from "@/config/h3";
import { updateTerritoriesForHexagons } from "./territory";
import type { Activity as StravaActivityPayload } from "@/lib/strava";

export type ImportResult =
  | { status: "already-imported"; activityId: number }
  | { status: "imported"; activityId: number; hexagonCount: number };

/**
 * Processes one Strava activity for a player:
 *   save Activity -> decode polyline -> compute H3 hexagons -> save ActivityHexagon rows
 *   -> recompute only the territories those hexagons belong to.
 *
 * Idempotent: Activity.stravaId is unique, so re-processing an already-imported activity
 * is a no-op rather than a duplicate or an error — safe to call repeatedly (e.g. once per
 * page load, or from a future daily cron) without extra bookkeeping by the caller.
 */
export async function importStravaActivity(playerId: number, raw: StravaActivityPayload): Promise<ImportResult> {
  const stravaId = BigInt(raw.id);

  const existing = await prisma.activity.findUnique({ where: { stravaId }, select: { id: true } });
  if (existing) {
    return { status: "already-imported", activityId: existing.id };
  }

  const polyline = raw.map?.summary_polyline || null;
  const resolution = resolutionForDiameterMeters(HEX_DIAMETER_METERS);
  const visits = polyline
    ? hexagonsForRoute(
        decodePolyline(polyline).map(([lat, lng]) => [lng, lat] as [number, number]),
        resolution
      )
    : [];

  const activity = await prisma.$transaction(async (tx) => {
    const created = await tx.activity.create({
      data: {
        stravaId,
        playerId,
        name: raw.name,
        type: raw.type,
        startDate: new Date(raw.start_date_local),
        distanceMeters: raw.distance,
        movingTimeSeconds: raw.moving_time,
        elevationGainMeters: raw.total_elevation_gain,
        polyline,
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
