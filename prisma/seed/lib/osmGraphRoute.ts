import type { Rng } from "./random";
import { haversineMeters } from "./geo";
import type { OsmNetworkGraph, OsmNodeId, WayMeta } from "./osmNetwork";

export type GraphRoutePoint = { lat: number; lng: number };

// Lower = preferred. Real trail surfaces first; steps are usable (hillside trails near Nice
// legitimately include stone stairs) but heavily discouraged over long stretches; secondary/
// tertiary/unclassified roads are the connectors identified as necessary in practice (see
// osmNetwork.ts) but should be used only when they're actually the useful link, not wandered
// along for their own sake.
function highwayWeight(highway: string): number {
  switch (highway) {
    case "path":
    case "track":
    case "bridleway":
      return 1.0;
    case "footway":
      return 1.3;
    case "unclassified":
      return 1.6;
    case "tertiary":
      return 2.0;
    case "secondary":
      return 2.6;
    case "steps":
      return 3.0;
    default:
      return 2.0;
  }
}

function edgeWeight(way: WayMeta): number {
  let weight = highwayWeight(way.highway);
  // sac_scale beyond hiking (T1/T2) makes a segment technical/exposed — still usable (trail
  // runners do cross these) but nudged down in preference rather than excluded outright.
  if (way.sacScale && way.sacScale !== "hiking" && way.sacScale !== "mountain_hiking") {
    weight *= 1.4;
  }
  return weight;
}

/**
 * Uniform-grid spatial index over the graph's nodes, so "nearest node to (lat,lng)" doesn't
 * mean scanning millions of nodes per lookup. Cell size (~0.01°, ~1km at this latitude) is
 * coarse enough to keep the index small but fine enough that a handful of neighboring cells
 * always contain a genuinely close node for anywhere inside the fetched radius.
 */
export class SpatialNodeIndex {
  private readonly cellSize = 0.01;
  private readonly cells = new Map<string, OsmNodeId[]>();

  constructor(private readonly graph: OsmNetworkGraph) {
    for (const [id, p] of Array.from(graph.nodes)) {
      const key = this.cellKey(p.lat, p.lng);
      if (!this.cells.has(key)) this.cells.set(key, []);
      this.cells.get(key)!.push(id);
    }
  }

  private cellKey(lat: number, lng: number): string {
    return `${Math.floor(lat / this.cellSize)}:${Math.floor(lng / this.cellSize)}`;
  }

  nearestNode(lat: number, lng: number): OsmNodeId | null {
    for (let ring = 0; ring <= 5; ring++) {
      let best: OsmNodeId | null = null;
      let bestDist = Infinity;

      const cellLat = Math.floor(lat / this.cellSize);
      const cellLng = Math.floor(lng / this.cellSize);
      for (let dLat = -ring; dLat <= ring; dLat++) {
        for (let dLng = -ring; dLng <= ring; dLng++) {
          if (Math.max(Math.abs(dLat), Math.abs(dLng)) !== ring) continue; // only the new ring's cells
          const ids = this.cells.get(`${cellLat + dLat}:${cellLng + dLng}`);
          if (!ids) continue;
          for (const id of ids) {
            const p = this.graph.nodes.get(id)!;
            const d = haversineMeters(lat, lng, p.lat, p.lng);
            if (d < bestDist) {
              bestDist = d;
              best = id;
            }
          }
        }
      }

      if (best !== null) return best;
    }

    return null;
  }
}

/**
 * Restricts the graph to its largest connected component. Real-world OSM data around a large
 * radius always has some genuinely isolated fragments (private paths, misconnected edits) —
 * picking a start point on one of those would make route generation fail or produce a
 * near-zero-length route, so route generation only ever operates on this filtered graph.
 * Measured on the actual Nice/80km dataset: the giant component covers ~90% of nodes.
 */
export function largestConnectedComponent(graph: OsmNetworkGraph): Set<OsmNodeId> {
  const visited = new Set<OsmNodeId>();
  let best: Set<OsmNodeId> = new Set();

  for (const start of Array.from(graph.nodes.keys())) {
    if (visited.has(start)) continue;

    const component = new Set<OsmNodeId>();
    const stack = [start];
    visited.add(start);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.add(current);
      for (const edge of graph.adjacency.get(current) ?? []) {
        if (!visited.has(edge.to)) {
          visited.add(edge.to);
          stack.push(edge.to);
        }
      }
    }

    if (component.size > best.size) best = component;
  }

  return best;
}

function pick<T>(rng: Rng, items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/**
 * Random walk over real graph edges, biased to keep moving away from the start point (so the
 * outbound leg of a loop actually goes somewhere, rather than immediately doubling back) and
 * toward lower-weight (more trail-like) edges. Stops once targetMeters is covered or a dead
 * end with no unvisited-in-this-walk option is hit.
 */
export function walkGraph(
  graph: OsmNetworkGraph,
  component: Set<OsmNodeId>,
  rng: Rng,
  startNode: OsmNodeId,
  targetMeters: number
): OsmNodeId[] {
  const path: OsmNodeId[] = [startNode];
  const startPoint = graph.nodes.get(startNode)!;
  let current = startNode;
  let previous: OsmNodeId | null = null;
  let covered = 0;

  while (covered < targetMeters) {
    const neighbors = (graph.adjacency.get(current) ?? []).filter((e) => component.has(e.to));
    if (neighbors.length === 0) break;

    // Prefer not to immediately walk back the way we came, unless it's the only option.
    const forward = neighbors.filter((e) => e.to !== previous);
    const candidates = forward.length > 0 ? forward : neighbors;

    const weights = candidates.map((e) => {
      const way = graph.ways[e.wayIndex];
      const candidatePoint = graph.nodes.get(e.to)!;
      const distFromStart = haversineMeters(startPoint.lat, startPoint.lng, candidatePoint.lat, candidatePoint.lng);
      // +1 keeps every edge selectable (never a hard zero), just less likely.
      const outwardBias = 1 + distFromStart / 1000;
      return outwardBias / edgeWeight(way);
    });

    const next = pick(rng, candidates, weights);
    previous = current;
    current = next.to;
    covered += next.distanceMeters;
    path.push(current);

    if (path.length > 20000) break; // safety net against a pathological infinite loop
  }

  return path;
}

type DijkstraResult = { path: OsmNodeId[]; distanceMeters: number } | null;

/** Shortest path back to the start — this is what makes a loop's return leg follow real paths
 * (unlike the old generator's straight-line closingLeg) instead of cutting cross-country. */
export function shortestPath(
  graph: OsmNetworkGraph,
  component: Set<OsmNodeId>,
  from: OsmNodeId,
  to: OsmNodeId
): DijkstraResult {
  const dist = new Map<OsmNodeId, number>([[from, 0]]);
  const prev = new Map<OsmNodeId, OsmNodeId>();
  const visited = new Set<OsmNodeId>();

  // A plain array-scan "priority queue" is fine here: this runs once per generated activity
  // (not per step of the walk), and the component size (a few million nodes worst case, but
  // Dijkstra stops as soon as `to` is settled) keeps this fast enough without a binary heap.
  const queue: OsmNodeId[] = [from];

  while (queue.length > 0) {
    queue.sort((a, b) => dist.get(a)! - dist.get(b)!);
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    if (current === to) break;

    for (const edge of graph.adjacency.get(current) ?? []) {
      if (!component.has(edge.to) || visited.has(edge.to)) continue;
      const way = graph.ways[edge.wayIndex];
      const cost = edge.distanceMeters * edgeWeight(way);
      const candidate = dist.get(current)! + cost;
      if (candidate < (dist.get(edge.to) ?? Infinity)) {
        dist.set(edge.to, candidate);
        prev.set(edge.to, current);
        queue.push(edge.to);
      }
    }
  }

  if (!dist.has(to)) return null;

  const path: OsmNodeId[] = [to];
  let cursor = to;
  while (cursor !== from) {
    const p = prev.get(cursor);
    if (p === undefined) return null;
    path.push(p);
    cursor = p;
  }
  path.reverse();

  let distanceMeters = 0;
  for (let i = 1; i < path.length; i++) {
    const a = graph.nodes.get(path[i - 1])!;
    const b = graph.nodes.get(path[i])!;
    distanceMeters += haversineMeters(a.lat, a.lng, b.lat, b.lng);
  }

  return { path, distanceMeters };
}

export function nodesToPoints(graph: OsmNetworkGraph, nodeIds: OsmNodeId[]): GraphRoutePoint[] {
  return nodeIds.map((id) => {
    const p = graph.nodes.get(id)!;
    return { lat: p.lat, lng: p.lng };
  });
}
