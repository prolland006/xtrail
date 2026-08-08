import { type Rng, randInt, pick } from "../lib/random";
import { encodePolyline } from "../lib/polylineEncode";
import { generateGraphTrailRoute, type GraphGenerationContext, type GeneratedTrailRoute } from "../lib/graphRouteGenerator";
import { estimateMovingTimeSeconds } from "../lib/estimateDuration";
import type { RiderProfile } from "../data/riderProfiles";

const ACTIVITY_NAME_TEMPLATES = [
  "Sortie",
  "Boucle",
  "Trail",
  "Reco parcours",
  "Session montagne",
  "Sortie matinale",
  "Footing trail",
];

// Weighted toward TrailRun since that's what this app is themed around; a few plain Runs
// for variety, matching how athletes occasionally log a mixed-terrain outing.
const ACTIVITY_TYPES = ["TrailRun", "TrailRun", "TrailRun", "Run"] as const;

export type SeedActivityInput = {
  providerActivityId: string;
  name: string;
  type: string;
  startDate: Date;
  distanceMeters: number;
  movingTimeSeconds: number;
  elevationGainMeters: number;
  polyline: string;
  route: GeneratedTrailRoute;
};

export async function generateSeedActivity(
  rng: Rng,
  providerActivityId: string,
  ctx: GraphGenerationContext,
  profile: RiderProfile
): Promise<SeedActivityInput> {
  const route = await generateGraphTrailRoute(ctx, rng, profile);

  const movingTimeSeconds = estimateMovingTimeSeconds(
    rng,
    route.distanceMeters,
    route.elevationGainMeters,
    route.elevationLossMeters,
    profile
  );

  return {
    providerActivityId,
    name: `${pick(rng, ACTIVITY_NAME_TEMPLATES)} - ${route.zone.label}`,
    type: pick(rng, ACTIVITY_TYPES),
    startDate: randomPastDate(rng),
    distanceMeters: route.distanceMeters,
    movingTimeSeconds,
    elevationGainMeters: route.elevationGainMeters,
    polyline: encodePolyline(route.points.map((p) => [p.lat, p.lng] as [number, number])),
    route,
  };
}

// Spread over the last ~15 months so the map shows a believable activity history rather
// than everything dated "today".
function randomPastDate(rng: Rng): Date {
  const daysAgo = randInt(rng, 1, 450);
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(randInt(rng, 6, 18), randInt(rng, 0, 59), 0, 0);
  return date;
}
