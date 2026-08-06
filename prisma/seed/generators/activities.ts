import { type Rng, randFloat, randInt, pick } from "../lib/random";
import { generateRoute, type GeneratedRoute, type RouteShape } from "../lib/routeGenerator";
import { encodePolyline } from "../lib/polylineEncode";
import { TRAILHEADS } from "../data/trailheads";

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

export type AthleteProfile = { paceMinPerKm: number; climbFactor: number };

export type SeedActivityInput = {
  stravaId: bigint;
  name: string;
  type: string;
  startDate: Date;
  distanceMeters: number;
  movingTimeSeconds: number;
  elevationGainMeters: number;
  polyline: string;
  route: GeneratedRoute;
};

export function generateSeedActivity(rng: Rng, stravaId: bigint, athlete: AthleteProfile): SeedActivityInput {
  const trailhead = pick(rng, TRAILHEADS);
  const shape: RouteShape = rng() < 0.7 ? "loop" : "out-and-back";
  const isLongRun = rng() < 0.12;
  const targetKm = isLongRun ? randFloat(rng, 32, 55) : randFloat(rng, 5, 28);

  const route = generateRoute(rng, trailhead, targetKm * 1000, shape);

  const paceVariance = randFloat(rng, 0.92, 1.12);
  const movingTimeSeconds = Math.round(
    (route.distanceMeters / 1000) * athlete.paceMinPerKm * 60 * paceVariance +
      (route.elevationGainMeters / 100) * athlete.climbFactor * 60
  );

  return {
    stravaId,
    name: `${pick(rng, ACTIVITY_NAME_TEMPLATES)} - ${trailhead.name}`,
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
