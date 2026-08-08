import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { hexagonsForRoute, resolutionForDiameterMeters } from "@/lib/h3";
import { HEX_DIAMETER_METERS } from "@/config/h3";
import { updateTerritoriesForHexagons } from "@/services/territory";
import { createRng, pickWeighted } from "./lib/random";
import { buildSeedPlayers } from "./generators/players";
import { generateSeedActivity } from "./generators/activities";
import { loadOrBuildOsmNetwork } from "./lib/osmNetwork";
import { createGenerationContext } from "./lib/graphRouteGenerator";
import {
  RANDOM_SEED,
  FAKE_PROVIDER_ACTIVITY_ID_BASE,
  TERRITORY_RECOMPUTE_BATCH_SIZE,
  TOTAL_FAKE_ACTIVITIES,
  FAKE_ACTIVITY_CENTER_LAT,
  FAKE_ACTIVITY_CENTER_LON,
  FAKE_ACTIVITY_RADIUS_KM,
} from "./config";

const PROGRESS_LOG_INTERVAL = 100;
const MAX_TRANSACTION_RETRIES = 5;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// A run generating thousands of activities takes long enough that a single transient DB
// hiccup (seen in practice: P2028 "Unable to start a transaction in the given time", likely
// brief pool contention rather than anything wrong with the data) would otherwise throw away
// all prior progress. Retries only the write itself — generateSeedActivity's real network
// calls (elevation) already happened and aren't redone.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isTransient = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2028";
      if (!isTransient || attempt >= MAX_TRANSACTION_RETRIES) throw err;
      console.warn(`  transaction attempt ${attempt} failed (${err.code}), retrying...`);
      await sleep(1000 * attempt);
    }
  }
}

/**
 * Fake-data seed for local/dev use, run before any real Strava account is connected.
 *
 * Deliberately reuses the same building blocks production import uses (hexagonsForRoute,
 * resolutionForDiameterMeters, updateTerritoriesForHexagons) instead of reimplementing the
 * H3/territory logic, so seeded data is processed by exactly the same rules real imported
 * activities are. Routes themselves come from a real OSM path network around Nice (see
 * lib/osmNetwork.ts / lib/graphRouteGenerator.ts) rather than a synthetic random walk.
 */
async function main() {
  const seed = Number(process.env.SEED_RANDOM_SEED) || RANDOM_SEED;
  const rng = createRng(seed);
  console.log(`Seeding with random seed ${seed} (override with SEED_RANDOM_SEED=<number>)`);

  console.log("Clearing previously seeded data (territories, players, and everything cascading from players)...");
  await prisma.territory.deleteMany();
  await prisma.player.deleteMany();

  const seedPlayers = buildSeedPlayers(rng);
  console.log(`Creating ${seedPlayers.length} players...`);
  const players = await Promise.all(
    seedPlayers.map((p) =>
      prisma.player.create({
        data: { firstName: p.firstName, lastName: p.lastName, email: p.email, photoUrl: p.photoUrl },
      })
    )
  );

  console.log(`Loading OSM path network (radius ${FAKE_ACTIVITY_RADIUS_KM}km around ${FAKE_ACTIVITY_CENTER_LAT},${FAKE_ACTIVITY_CENTER_LON})...`);
  const graph = await loadOrBuildOsmNetwork(FAKE_ACTIVITY_CENTER_LAT, FAKE_ACTIVITY_CENTER_LON, FAKE_ACTIVITY_RADIUS_KM);
  const ctx = createGenerationContext(graph);

  const resolution = resolutionForDiameterMeters(HEX_DIAMETER_METERS);
  const touchedHexagons = new Set<string>();
  const activityCountByPlayer = new Map<number, number>();
  let providerActivityIdCounter = FAKE_PROVIDER_ACTIVITY_ID_BASE;

  console.log(`Generating ${TOTAL_FAKE_ACTIVITIES} activities on the real path network...`);
  const startedAt = Date.now();

  for (let i = 0; i < TOTAL_FAKE_ACTIVITIES; i++) {
    const playerIndex = pickWeighted(
      rng,
      seedPlayers.map((p, idx) => ({ idx, weight: p.activityWeight }))
    ).idx;
    const player = players[playerIndex];
    const profile = seedPlayers[playerIndex].profile;

    const input = await generateSeedActivity(rng, String(providerActivityIdCounter++), ctx, profile);

    const visits = hexagonsForRoute(
      input.route.points.map((p) => [p.lng, p.lat] as [number, number]),
      resolution
    );

    await withRetry(() =>
      prisma.$transaction(
        async (tx) => {
          const activity = await tx.activity.create({
            data: {
              provider: "strava",
              providerActivityId: input.providerActivityId,
              playerId: player.id,
              name: input.name,
              type: input.type,
              startDate: input.startDate,
              distanceMeters: input.distanceMeters,
              movingTimeSeconds: input.movingTimeSeconds,
              elevationGainMeters: input.elevationGainMeters,
              polyline: input.polyline,
            },
          });

          if (visits.length > 0) {
            // Natural-key primary key (activityId, h3Index) plus hexagonsForRoute deduping
            // by cell internally means this can never insert a duplicate activity/hexagon pair.
            await tx.activityHexagon.createMany({
              data: visits.map((v) => ({
                activityId: activity.id,
                playerId: player.id,
                h3Index: v.h3Index,
                distanceMeters: v.distanceMeters,
              })),
            });
          }
        },
        { maxWait: 10000, timeout: 20000 }
      )
    );

    visits.forEach((v) => touchedHexagons.add(v.h3Index));
    activityCountByPlayer.set(player.id, (activityCountByPlayer.get(player.id) ?? 0) + 1);

    if ((i + 1) % PROGRESS_LOG_INTERVAL === 0 || i + 1 === TOTAL_FAKE_ACTIVITIES) {
      const elapsedS = ((Date.now() - startedAt) / 1000).toFixed(0);
      console.log(`  ${i + 1}/${TOTAL_FAKE_ACTIVITIES} activities generated (${elapsedS}s elapsed)`);
    }
  }

  for (let i = 0; i < players.length; i++) {
    const count = activityCountByPlayer.get(players[i].id) ?? 0;
    console.log(`  ${players[i].firstName} ${players[i].lastName} (${seedPlayers[i].profile.id}): ${count} activities`);
  }

  console.log(`Generated ${TOTAL_FAKE_ACTIVITIES} activities touching ${touchedHexagons.size} distinct hexagons.`);
  console.log("Computing territory ownership...");

  const hexList = Array.from(touchedHexagons);
  for (let i = 0; i < hexList.length; i += TERRITORY_RECOMPUTE_BATCH_SIZE) {
    const batch = hexList.slice(i, i + TERRITORY_RECOMPUTE_BATCH_SIZE);
    await withRetry(() => updateTerritoriesForHexagons(batch));
    if ((i / TERRITORY_RECOMPUTE_BATCH_SIZE) % 10 === 0) {
      console.log(`  territories: ${Math.min(i + TERRITORY_RECOMPUTE_BATCH_SIZE, hexList.length)}/${hexList.length} hexagons`);
    }
  }

  const territoryCount = await prisma.territory.count();
  console.log(`Done. ${territoryCount} territories now have an owner.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
