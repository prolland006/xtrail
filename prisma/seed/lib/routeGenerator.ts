import { type Rng, randFloat, gaussian } from "./random";
import { haversineMeters, bearingBetween, destinationPoint } from "./geo";
import { isOverSea } from "./coastline";
import type { Trailhead } from "../data/trailheads";

export type RoutePoint = { lat: number; lng: number; elevation: number };
export type RouteShape = "loop" | "out-and-back";

export type GeneratedRoute = {
  points: RoutePoint[];
  distanceMeters: number;
  elevationGainMeters: number;
};

// Distance between consecutive raw walk points. Small enough that the H3 densify() step in
// src/lib/h3.ts rarely has to insert extra points, large enough to keep point counts sane
// for a 50km route.
const STEP_METERS = 60;

/**
 * Procedurally generates a GPS trail route around a trailhead.
 *
 * "loop": a free meander outward (random-walk bearing, gaussian turns — never a straight
 * line) followed by a closing leg that steers directly back to the trailhead, the way a
 * real loop trail's final stretch (fire road, return path) is usually more direct than the
 * exploratory outbound leg.
 *
 * "out-and-back": a free meander outward for half the distance, then the same path
 * retraced with a small lateral jitter (real out-and-back runs rarely retrace the exact
 * same line underfoot).
 */
export function generateRoute(
  rng: Rng,
  trailhead: Trailhead,
  targetDistanceMeters: number,
  shape: RouteShape
): GeneratedRoute {
  const outboundTarget = shape === "loop" ? targetDistanceMeters * 0.85 : targetDistanceMeters / 2;
  const outbound = walk(rng, trailhead.lat, trailhead.lng, outboundTarget);
  const last = outbound[outbound.length - 1];

  const points =
    shape === "loop"
      ? [...outbound, ...closingLeg(rng, last.lat, last.lng, trailhead.lat, trailhead.lng)]
      : [...outbound, ...mirrorBack(rng, outbound)];

  const withElevation = applyElevationProfile(rng, points, trailhead.baseElevation);

  return {
    points: withElevation,
    distanceMeters: pathLength(withElevation),
    elevationGainMeters: elevationGain(withElevation),
  };
}

// Given a candidate step, turns further and further away from the sea until it finds a
// landward point — each retry rotates 45° further from the original bearing. Falls back to
// heading due north (always inland across this bounding box) if nothing else works.
function landwardStep(lat: number, lng: number, bearing: number, step: number): [number, number, number] {
  let candidateBearing = bearing;

  for (let attempt = 0; attempt < 8; attempt++) {
    const [candidateLat, candidateLng] = destinationPoint(lat, lng, candidateBearing, step);
    if (!isOverSea(candidateLat, candidateLng)) {
      return [candidateLat, candidateLng, candidateBearing];
    }
    candidateBearing = (candidateBearing + 45) % 360;
  }

  const [fallbackLat, fallbackLng] = destinationPoint(lat, lng, 0, step);
  return [fallbackLat, fallbackLng, 0];
}

// Correlated random walk: bearing meanders by a gaussian delta each step rather than
// jumping randomly, so the path curves smoothly like a real trail instead of zig-zagging.
// Steps that would land in the sea (relevant for coastal trailheads like Mont Boron) are
// redirected inland via landwardStep instead of being taken as-is.
function walk(rng: Rng, startLat: number, startLng: number, targetMeters: number): RoutePoint[] {
  const points: RoutePoint[] = [{ lat: startLat, lng: startLng, elevation: 0 }];
  let lat = startLat;
  let lng = startLng;
  let bearing = randFloat(rng, 0, 360);
  let covered = 0;

  while (covered < targetMeters) {
    bearing = (((bearing + gaussian(rng, 0, 18)) % 360) + 360) % 360;

    const step = randFloat(rng, STEP_METERS * 0.6, STEP_METERS * 1.4);
    [lat, lng, bearing] = landwardStep(lat, lng, bearing, step);
    covered += step;
    points.push({ lat, lng, elevation: 0 });
  }

  return points;
}

// Heads more directly from (fromLat, fromLng) back to (toLat, toLng), with a little noise
// so it's not a perfectly straight line. Capped iteration count as a safety net against an
// unreachable target (never expected in practice given the geometry above). Also routed
// through landwardStep since a direct bearing back to a coastal trailhead can graze the sea.
function closingLeg(rng: Rng, fromLat: number, fromLng: number, toLat: number, toLng: number): RoutePoint[] {
  const points: RoutePoint[] = [];
  let lat = fromLat;
  let lng = fromLng;
  let guard = 0;

  while (haversineMeters(lat, lng, toLat, toLng) > 40 && guard < 2000) {
    const remaining = haversineMeters(lat, lng, toLat, toLng);
    const bearing = bearingBetween(lat, lng, toLat, toLng) + gaussian(rng, 0, 8);
    const step = Math.min(STEP_METERS, remaining);
    [lat, lng] = landwardStep(lat, lng, bearing, Math.max(step, 5));
    points.push({ lat, lng, elevation: 0 });
    guard++;
  }

  points.push({ lat: toLat, lng: toLng, elevation: 0 });
  return points;
}

// Retraces the outbound leg in reverse with a small perpendicular-ish jitter per point, so
// the return trip isn't pixel-identical to the way out. The jitter is dropped (falls back to
// the exact outbound point) on the rare case it would land in the sea.
function mirrorBack(rng: Rng, outbound: RoutePoint[]): RoutePoint[] {
  const reversed = [...outbound].reverse().slice(1);
  return reversed.map((p) => {
    const jitterBearing = randFloat(rng, 0, 360);
    const jitterMeters = randFloat(rng, 0, 15);
    const [lat, lng] = destinationPoint(p.lat, p.lng, jitterBearing, jitterMeters);
    return isOverSea(lat, lng) ? { lat: p.lat, lng: p.lng, elevation: 0 } : { lat, lng, elevation: 0 };
  });
}

// Layers two sine waves (a long "which valley/ridge" undulation and a shorter "rolling
// terrain" undulation) plus smoothed random noise on top of the trailhead's base elevation,
// so different routes get visibly different elevation profiles and gain totals.
function applyElevationProfile(rng: Rng, points: RoutePoint[], baseElevation: number): RoutePoint[] {
  const wave1Period = randFloat(rng, 1500, 4000);
  const wave2Period = randFloat(rng, 400, 900);
  const wave1Phase = randFloat(rng, 0, Math.PI * 2);
  const wave2Phase = randFloat(rng, 0, Math.PI * 2);
  const wave1Amplitude = randFloat(rng, 60, 220);
  const wave2Amplitude = randFloat(rng, 15, 50);

  let cumulative = 0;
  let smoothedNoise = 0;

  return points.map((p, i) => {
    if (i > 0) cumulative += haversineMeters(points[i - 1].lat, points[i - 1].lng, p.lat, p.lng);

    smoothedNoise = smoothedNoise * 0.85 + gaussian(rng, 0, 6) * 0.15;
    const elevation =
      baseElevation +
      Math.sin(cumulative / wave1Period + wave1Phase) * wave1Amplitude +
      Math.sin(cumulative / wave2Period + wave2Phase) * wave2Amplitude +
      smoothedNoise;

    return { ...p, elevation: Math.max(elevation, 0) };
  });
}

function pathLength(points: RoutePoint[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return total;
}

function elevationGain(points: RoutePoint[]): number {
  let gain = 0;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].elevation - points[i - 1].elevation;
    if (delta > 0) gain += delta;
  }
  return gain;
}
