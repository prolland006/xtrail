import { cellToLatLng } from "h3-js";
import { prisma } from "@/lib/db";

/**
 * Territory ownership algorithm.
 *
 * For a given hexagon, ownership goes to whichever player has the most cumulated
 * presence in it — currently measured as the number of distinct activities (visits)
 * that pass through the hexagon, counted per player across their full history.
 *
 * Ties (equal visit counts) are broken by recency: whichever player's most recent
 * visit to that hexagon is newer wins, matching the intuitive "you just (re)conquered
 * it" rule of a live territory game. This is why ActivityHexagon carries a createdAt —
 * its only purpose is this tiebreak.
 *
 * This is recomputed per-hexagon, never for the whole map: callers pass exactly the
 * hexagons a newly imported activity touched, so an import only ever updates the
 * territories it could plausibly have changed.
 */
export async function updateTerritoriesForHexagons(h3Indexes: string[]): Promise<void> {
  const uniqueHexes = Array.from(new Set(h3Indexes));

  await Promise.all(uniqueHexes.map(recomputeTerritory));
}

async function recomputeTerritory(h3Index: string): Promise<void> {
  const standings = await prisma.activityHexagon.groupBy({
    by: ["playerId"],
    where: { h3Index },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: [{ _count: { playerId: "desc" } }, { _max: { createdAt: "desc" } }],
    take: 1,
  });

  const winner = standings[0];

  if (!winner) {
    // No visits left for this hexagon (e.g. the only contributing activity was deleted) —
    // drop the territory rather than leaving a stale owner behind.
    await prisma.territory.deleteMany({ where: { h3Index } });
    return;
  }

  // Cached at write time (not derived on read) so the map can filter by viewport with a plain
  // indexed bbox query instead of loading every territory and computing this from h3Index on
  // every request — see getTerritoriesInBounds and the schema comment on Territory.
  const [centerLat, centerLng] = cellToLatLng(h3Index);

  await prisma.territory.upsert({
    where: { h3Index },
    create: { h3Index, ownerId: winner.playerId, ownerPresence: winner._count._all, centerLat, centerLng },
    update: { ownerId: winner.playerId, ownerPresence: winner._count._all, centerLat, centerLng },
  });
}

export type TerritoryView = {
  h3Index: string;
  ownerId: number;
  ownerPresence: number;
  owner: { firstName: string; lastName: string; photoUrl: string };
};

const TERRITORY_SELECT = {
  h3Index: true,
  ownerId: true,
  ownerPresence: true,
  owner: { select: { firstName: true, lastName: true, photoUrl: true } },
} as const;

export type LatLngBounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

/**
 * The map's real data source: only territories whose cached centroid falls within the given
 * viewport, capped at `limit`. Replaces a previous getTerritories() that loaded every owned
 * territory unconditionally — measured at ~112k rows, that took 2.2s server-side and produced
 * a 93MB GeoJSON payload regardless of what part of the map was actually visible.
 */
export async function getTerritoriesInBounds(bounds: LatLngBounds, limit: number): Promise<TerritoryView[]> {
  const territories = await prisma.territory.findMany({
    where: {
      ownerId: { not: null },
      centerLat: { gte: bounds.minLat, lte: bounds.maxLat },
      centerLng: { gte: bounds.minLng, lte: bounds.maxLng },
    },
    take: limit,
    select: TERRITORY_SELECT,
  });

  // ownerId/owner are non-null by construction (filtered above); narrow the type for callers.
  return territories as TerritoryView[];
}

// Cheap existence check for the map's empty state — an indexed count, not a full row fetch.
export async function getTerritoryCount(): Promise<number> {
  return prisma.territory.count({ where: { ownerId: { not: null } } });
}

// Used only to pick a sensible default map camera position on first load — not to fit every
// territory in view (with ~112k spread across an 80km radius, "fit everything" would mean
// starting zoomed out over the whole region, the exact case this whole change avoids).
export async function getTerritoryCenter(): Promise<{ lat: number; lng: number } | null> {
  const result = await prisma.territory.aggregate({
    where: { ownerId: { not: null } },
    _avg: { centerLat: true, centerLng: true },
  });

  if (result._avg.centerLat === null || result._avg.centerLng === null) return null;
  return { lat: result._avg.centerLat, lng: result._avg.centerLng };
}
