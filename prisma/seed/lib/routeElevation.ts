import { haversineMeters } from "./geo";
import { getElevations } from "./elevation";
import type { OsmNetworkGraph, OsmNodeId } from "./osmNetwork";

export type ElevatedPoint = { lat: number; lng: number; elevation: number };

// Real-world SRTM90m resolution is ~90m — asking for elevation at every graph node (often just
// a few meters apart) wouldn't add precision, just more network calls. Sampling every ~100m of
// route distance and interpolating between samples matches the data's own resolution.
const ELEVATION_SAMPLE_INTERVAL_METERS = 100;

/**
 * Assigns a real, terrain-derived elevation to every point of a graph-based route (see
 * osmGraphRoute.ts). Samples elevation from OpenTopoData every ~100m of route distance
 * (cached per OSM node id — see elevation.ts) and linearly interpolates the points in between,
 * so D+ ends up derived from real relief rather than a synthetic profile.
 */
export async function assignRouteElevation(
  nodeIds: OsmNodeId[],
  graph: OsmNetworkGraph
): Promise<ElevatedPoint[]> {
  const points = nodeIds.map((id) => ({ id, ...graph.nodes.get(id)! }));

  const sampleIndices: number[] = [0];
  let sinceLastSample = 0;
  for (let i = 1; i < points.length; i++) {
    sinceLastSample += haversineMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    if (sinceLastSample >= ELEVATION_SAMPLE_INTERVAL_METERS) {
      sampleIndices.push(i);
      sinceLastSample = 0;
    }
  }
  if (sampleIndices[sampleIndices.length - 1] !== points.length - 1) {
    sampleIndices.push(points.length - 1);
  }

  const samplePoints = sampleIndices.map((i) => points[i]);
  const elevations = await getElevations(samplePoints);

  // A missing sample (real SRTM void, or every retry for its batch failed — see elevation.ts)
  // must never be treated as sea level: that would fabricate a cliff between a real elevation
  // and a fake 0. Instead, fill from the nearest sample (in walk order) that does have a real
  // value — a flat stretch is a far safer default than an invented drop, and with samples
  // every ~100m, "nearest neighbor" is never far from the gap.
  const sampleElevations: (number | null)[] = sampleIndices.map((i) => elevations.get(points[i].id) ?? null);
  for (let s = 1; s < sampleElevations.length; s++) {
    if (sampleElevations[s] === null) sampleElevations[s] = sampleElevations[s - 1];
  }
  for (let s = sampleElevations.length - 2; s >= 0; s--) {
    if (sampleElevations[s] === null) sampleElevations[s] = sampleElevations[s + 1];
  }
  // Only reachable if every single sample for this route failed to resolve.
  for (let s = 0; s < sampleElevations.length; s++) {
    if (sampleElevations[s] === null) sampleElevations[s] = 0;
  }

  const result: ElevatedPoint[] = new Array(points.length);
  for (let s = 0; s < sampleIndices.length - 1; s++) {
    const startIdx = sampleIndices[s];
    const endIdx = sampleIndices[s + 1];
    const startElev = sampleElevations[s]!;
    const endElev = sampleElevations[s + 1]!;

    for (let i = startIdx; i <= endIdx; i++) {
      const t = endIdx === startIdx ? 0 : (i - startIdx) / (endIdx - startIdx);
      result[i] = { lat: points[i].lat, lng: points[i].lng, elevation: startElev + (endElev - startElev) * t };
    }
  }

  return result;
}
