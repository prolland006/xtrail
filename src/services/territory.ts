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

  await prisma.territory.upsert({
    where: { h3Index },
    create: { h3Index, ownerId: winner.playerId, ownerPresence: winner._count._all },
    update: { ownerId: winner.playerId, ownerPresence: winner._count._all },
  });
}

export type TerritoryView = {
  h3Index: string;
  ownerId: number;
  ownerPresence: number;
  owner: { firstName: string; lastName: string; photoUrl: string };
};

// The map's only data source — reads the persisted cache, never touches Activity or
// ActivityHexagon, so displaying the map costs one indexed query regardless of how many
// activities or hex-visits exist behind it.
export async function getTerritories(): Promise<TerritoryView[]> {
  const territories = await prisma.territory.findMany({
    where: { ownerId: { not: null } },
    select: {
      h3Index: true,
      ownerId: true,
      ownerPresence: true,
      owner: { select: { firstName: true, lastName: true, photoUrl: true } },
    },
  });

  // ownerId/owner are non-null by construction (filtered above); narrow the type for callers.
  return territories as TerritoryView[];
}
