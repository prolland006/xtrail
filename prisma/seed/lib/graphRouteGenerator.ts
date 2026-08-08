import type { Rng } from "./random";
import { randFloat, pick, pickWeighted, gaussian } from "./random";
import { haversineMeters, destinationPoint } from "./geo";
import { assignRouteElevation, type ElevatedPoint } from "./routeElevation";
import { SpatialNodeIndex, largestConnectedComponent, walkGraph, shortestPath, nodesToPoints } from "./osmGraphRoute";
import type { OsmNetworkGraph, OsmNodeId } from "./osmNetwork";
import { GEO_ZONES, type GeoZone } from "../data/zones";
import type { RiderProfile } from "../data/riderProfiles";
import { DISTANCE_BUCKETS } from "../data/distanceDistribution";
import { FAKE_ACTIVITY_CENTER_LAT, FAKE_ACTIVITY_CENTER_LON } from "../config";

export type RouteShape = "loop" | "out-and-back" | "traverse";

export type GeneratedTrailRoute = {
  points: ElevatedPoint[];
  distanceMeters: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  zone: GeoZone;
  shape: RouteShape;
};

// How many candidate "popular" start points to generate per zone. A minority of activities
// (see POPULAR_POINT_PROBABILITY) start from a fresh random point instead — together this is
// what makes some trails see many passages and others just a handful (spec point 11), rather
// than a uniform spread.
const POPULAR_POINTS_PER_ZONE = 6;
const POPULAR_POINT_PROBABILITY = 0.7;

const SHAPES: { shape: RouteShape; weight: number }[] = [
  { shape: "loop", weight: 55 },
  { shape: "out-and-back", weight: 30 },
  { shape: "traverse", weight: 15 },
];

// GPS receivers are noisy but a real trace still hugs the actual path — small enough that the
// point stays visually on/near the trail rather than drifting onto a neighboring one.
const GPS_NOISE_METERS_STDDEV = 4;

function randomPointInZone(rng: Rng, zone: GeoZone): { lat: number; lng: number } {
  const bearing = randFloat(rng, 0, 360);
  const distanceKm = randFloat(rng, zone.minKm, zone.maxKm);
  const [lat, lng] = destinationPoint(FAKE_ACTIVITY_CENTER_LAT, FAKE_ACTIVITY_CENTER_LON, bearing, distanceKm * 1000);
  return { lat, lng };
}

/**
 * Picks a start node for the given zone: most of the time from a small, fixed-per-zone pool of
 * "popular" points (shared across many generated activities, so some real graph edges end up
 * walked far more often than others — spec point 11), occasionally a fresh random point in the
 * zone for variety (spec point 12).
 */
function pickStartNode(
  rng: Rng,
  zone: GeoZone,
  index: SpatialNodeIndex,
  component: Set<OsmNodeId>,
  popularPointsByZone: Map<string, OsmNodeId[]>
): OsmNodeId {
  if (!popularPointsByZone.has(zone.id)) {
    const points: OsmNodeId[] = [];
    for (let i = 0; i < POPULAR_POINTS_PER_ZONE * 4 && points.length < POPULAR_POINTS_PER_ZONE; i++) {
      const candidate = randomPointInZone(rng, zone);
      const node = index.nearestNode(candidate.lat, candidate.lng);
      if (node !== null && component.has(node)) points.push(node);
    }
    popularPointsByZone.set(zone.id, points);
  }

  const popular = popularPointsByZone.get(zone.id)!;
  if (popular.length > 0 && rng() < POPULAR_POINT_PROBABILITY) {
    return pick(rng, popular);
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const candidate = randomPointInZone(rng, zone);
    const node = index.nearestNode(candidate.lat, candidate.lng);
    if (node !== null && component.has(node)) return node;
  }

  // Extremely unlikely (component covers ~90% of the graph) — fall back to a known-good point.
  return popular[0];
}

function pickDistanceTargetMeters(rng: Rng, profile: RiderProfile): number {
  const bucket = pickWeighted(rng, DISTANCE_BUCKETS);
  const lo = Math.max(bucket.minKm, profile.preferredDistanceKm[0]);
  const hi = Math.min(bucket.maxKm, profile.preferredDistanceKm[1]);
  const [finalLo, finalHi] = lo <= hi ? [lo, hi] : profile.preferredDistanceKm;
  return randFloat(rng, finalLo, finalHi) * 1000;
}

function addGpsNoise(rng: Rng, points: ElevatedPoint[]): ElevatedPoint[] {
  return points.map((p) => {
    const bearing = randFloat(rng, 0, 360);
    const magnitude = Math.abs(gaussian(rng, 0, GPS_NOISE_METERS_STDDEV));
    const [lat, lng] = destinationPoint(p.lat, p.lng, bearing, magnitude);
    return { lat, lng, elevation: p.elevation };
  });
}

function pathDistanceMeters(points: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
  }
  return total;
}

function elevationDeltas(points: ElevatedPoint[]): { gain: number; loss: number } {
  let gain = 0;
  let loss = 0;
  for (let i = 1; i < points.length; i++) {
    const delta = points[i].elevation - points[i - 1].elevation;
    if (delta > 0) gain += delta;
    else loss += -delta;
  }
  return { gain, loss };
}

export type GraphGenerationContext = {
  graph: OsmNetworkGraph;
  component: Set<OsmNodeId>;
  index: SpatialNodeIndex;
  popularPointsByZone: Map<string, OsmNodeId[]>;
};

export function createGenerationContext(graph: OsmNetworkGraph): GraphGenerationContext {
  return {
    graph,
    component: largestConnectedComponent(graph),
    index: new SpatialNodeIndex(graph),
    popularPointsByZone: new Map(),
  };
}

/**
 * Produces one full trail route for the given rider profile: picks a zone, walks the real OSM
 * graph for a target distance/shape drawn from that profile's plausible range, derives
 * elevation from real relief, and adds GPS noise — end to end replacement for the old
 * lib/routeGenerator.ts random walk. The profile is a parameter (not picked internally)
 * because it's assigned once per player (see generators/players.ts), not re-rolled per
 * activity — a given player's activities should consistently reflect one archetype.
 */
export async function generateGraphTrailRoute(
  ctx: GraphGenerationContext,
  rng: Rng,
  profile: RiderProfile
): Promise<GeneratedTrailRoute> {
  const zone = pickWeighted(rng, GEO_ZONES);
  const shape = pickWeighted(rng, SHAPES).shape;
  const targetMeters = pickDistanceTargetMeters(rng, profile);

  const startNode = pickStartNode(rng, zone, ctx.index, ctx.component, ctx.popularPointsByZone);

  let nodeIds: OsmNodeId[];

  if (shape === "traverse") {
    nodeIds = walkGraph(ctx.graph, ctx.component, rng, startNode, targetMeters);
  } else if (shape === "out-and-back") {
    const outbound = walkGraph(ctx.graph, ctx.component, rng, startNode, targetMeters / 2);
    const reversed = [...outbound].reverse().slice(1);
    nodeIds = [...outbound, ...reversed];
  } else {
    const outbound = walkGraph(ctx.graph, ctx.component, rng, startNode, targetMeters * 0.85);
    const closure = shortestPath(ctx.graph, ctx.component, outbound[outbound.length - 1], startNode);
    nodeIds = closure ? [...outbound, ...closure.path.slice(1)] : outbound;
  }

  const rawPoints = nodesToPoints(ctx.graph, nodeIds);
  const elevated = await assignRouteElevation(nodeIds, ctx.graph);
  const noisy = addGpsNoise(rng, elevated);
  const { gain, loss } = elevationDeltas(elevated);

  return {
    points: noisy,
    distanceMeters: pathDistanceMeters(rawPoints),
    elevationGainMeters: gain,
    elevationLossMeters: loss,
    zone,
    shape,
  };
}
