import { prisma } from "@/lib/db";
import { hexagonsForRoute, resolutionForDiameterMeters } from "@/lib/h3";
import { HEX_DIAMETER_METERS } from "@/config/h3";
import { updateTerritoriesForHexagons } from "@/services/territory";
import { createRng, randInt } from "./lib/random";
import { buildSeedPlayers } from "./generators/players";
import { generateSeedActivity } from "./generators/activities";
import {
  RANDOM_SEED,
  MIN_ACTIVITIES_PER_PLAYER,
  MAX_ACTIVITIES_PER_PLAYER,
  FAKE_STRAVA_ID_BASE,
  TERRITORY_RECOMPUTE_BATCH_SIZE,
} from "./config";

/**
 * Fake-data seed for local/dev use, run before any real Strava account is connected.
 *
 * Deliberately reuses the same building blocks production import uses (hexagonsForRoute,
 * resolutionForDiameterMeters, updateTerritoriesForHexagons) instead of reimplementing the
 * H3/territory logic, so seeded data is processed by exactly the same rules real imported
 * activities are.
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

  const resolution = resolutionForDiameterMeters(HEX_DIAMETER_METERS);
  const touchedHexagons = new Set<string>();
  let stravaIdCounter = FAKE_STRAVA_ID_BASE;
  let activityCount = 0;

  console.log("Generating activities and H3 hexagons...");
  for (let i = 0; i < players.length; i++) {
    const player = players[i];
    const profile = seedPlayers[i];
    const activitiesForPlayer = randInt(rng, MIN_ACTIVITIES_PER_PLAYER, MAX_ACTIVITIES_PER_PLAYER);

    for (let j = 0; j < activitiesForPlayer; j++) {
      const input = generateSeedActivity(rng, BigInt(stravaIdCounter++), profile);

      const visits = hexagonsForRoute(
        input.route.points.map((p) => [p.lng, p.lat] as [number, number]),
        resolution
      );

      await prisma.$transaction(async (tx) => {
        const activity = await tx.activity.create({
          data: {
            stravaId: input.stravaId,
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
      });

      visits.forEach((v) => touchedHexagons.add(v.h3Index));
      activityCount++;
    }

    console.log(`  ${player.firstName} ${player.lastName}: ${activitiesForPlayer} activities`);
  }

  console.log(`Generated ${activityCount} activities touching ${touchedHexagons.size} distinct hexagons.`);
  console.log("Computing territory ownership...");

  const hexList = Array.from(touchedHexagons);
  for (let i = 0; i < hexList.length; i += TERRITORY_RECOMPUTE_BATCH_SIZE) {
    await updateTerritoriesForHexagons(hexList.slice(i, i + TERRITORY_RECOMPUTE_BATCH_SIZE));
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
