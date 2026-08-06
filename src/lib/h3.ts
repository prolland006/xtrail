import {
  latLngToCell,
  cellToBoundary,
  getHexagonEdgeLengthAvg,
  originToDirectedEdges,
  getDirectedEdgeDestination,
  directedEdgeToBoundary,
} from "h3-js";

// H3 only ships a fixed set of resolutions (0-15), each with its own average hexagon size —
// there's no continuous "give me exactly N meters" API. This picks the resolution whose
// corner-to-corner diameter (2x edge length) is closest to the requested diameter.
export function resolutionForDiameterMeters(diameterMeters: number): number {
  let bestResolution = 0;
  let bestDiff = Infinity;

  for (let res = 0; res <= 15; res++) {
    const diameter = getHexagonEdgeLengthAvg(res, "m") * 2;
    const diff = Math.abs(diameter - diameterMeters);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestResolution = res;
    }
  }

  return bestResolution;
}

function haversineMeters([lngA, latA]: [number, number], [lngB, latB]: [number, number]): number {
  const earthRadiusMeters = 6371000;
  const dLat = ((latB - latA) * Math.PI) / 180;
  const dLng = ((lngB - lngA) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((latA * Math.PI) / 180) * Math.cos((latB * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}

// Interpolates extra points between consecutive route points so that no point-to-point gap
// exceeds maxStepMeters — otherwise a hexagon a sparse GPS trace jumps over would never get
// picked up when mapping points to cells below.
function densify(coords: [number, number][], maxStepMeters: number): [number, number][] {
  const out: [number, number][] = [];

  for (let i = 0; i < coords.length - 1; i++) {
    const a = coords[i];
    const b = coords[i + 1];
    out.push(a);

    const steps = Math.floor(haversineMeters(a, b) / maxStepMeters);
    for (let s = 1; s <= steps; s++) {
      const t = s / (steps + 1);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }

  if (coords.length > 0) out.push(coords[coords.length - 1]);
  return out;
}

export type HexagonVisit = { h3Index: string; distanceMeters: number };

// Coords are [lng, lat] pairs (GeoJSON/MapLibre order). Returns every H3 cell the route
// passes through at the given resolution, with the distance covered inside each one —
// each route segment's length is attributed to the cell its midpoint falls in.
export function hexagonsForRoute(coords: [number, number][], resolution: number): HexagonVisit[] {
  const edgeMeters = getHexagonEdgeLengthAvg(resolution, "m");
  const densified = densify(coords, edgeMeters);
  const distanceByCell = new Map<string, number>();

  for (let i = 0; i < densified.length - 1; i++) {
    const a = densified[i];
    const b = densified[i + 1];
    const midpoint: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const cell = latLngToCell(midpoint[1], midpoint[0], resolution);
    distanceByCell.set(cell, (distanceByCell.get(cell) ?? 0) + haversineMeters(a, b));
  }

  // A route with a single point has no segments — still record presence in its cell.
  if (densified.length === 1) {
    const [lng, lat] = densified[0];
    distanceByCell.set(latLngToCell(lat, lng, resolution), 0);
  }

  return Array.from(distanceByCell, ([h3Index, distanceMeters]) => ({ h3Index, distanceMeters }));
}

// Returns a closed ring of [lng, lat] pairs suitable for a GeoJSON Polygon.
export function hexagonBoundary(h3Index: string): [number, number][] {
  const boundary = cellToBoundary(h3Index, true) as [number, number][];
  const first = boundary[0];
  const last = boundary[boundary.length - 1];
  const alreadyClosed = first[0] === last[0] && first[1] === last[1];
  return alreadyClosed ? boundary : [...boundary, first];
}

// Duck-typed rather than importing TerritoryView from services/territory: keeps this module
// (pure H3 geometry, no I/O) independent of the service layer, while TerritoryView already
// satisfies this shape structurally.
export type OwnedHexagon = { h3Index: string; ownerId: number; owner: { firstName: string; lastName: string } };

export type TerritoryFillFeature = {
  type: "Feature";
  properties: { ownerId: number; ownerName: string };
  geometry: { type: "Polygon"; coordinates: [number, number][][] };
};

// One filled polygon per owned hexagon — map components read the coordinates straight off
// this, no H3 computation left for the client to do (see the map architecture rules).
export function territoryFillFeatures(territories: OwnedHexagon[]): TerritoryFillFeature[] {
  return territories.map((t) => ({
    type: "Feature",
    properties: { ownerId: t.ownerId, ownerName: `${t.owner.firstName} ${t.owner.lastName}` },
    geometry: { type: "Polygon", coordinates: [hexagonBoundary(t.h3Index)] },
  }));
}

export type TerritoryBorderFeature = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

/**
 * "Frontiers only" outline: a hexagon edge is emitted only when it separates two different
 * owners, or an owner from unclaimed ground — never between two same-owner neighbors. Uses
 * h3-js's own directed-edge API (originToDirectedEdges / getDirectedEdgeDestination /
 * directedEdgeToBoundary) rather than a hand-rolled adjacency or polygon-dissolve algorithm:
 * it already knows, for a given cell, the exact neighbor and shared boundary geometry for
 * each of its edges, pentagons included.
 *
 * Each physical edge is emitted exactly once even though both neighboring owned hexagons
 * "see" it (via the neighbor < h3Index tie-break below) — otherwise a boundary between two
 * different owners would be drawn twice, once from each side.
 */
export function territoryBorderFeatures(territories: OwnedHexagon[]): TerritoryBorderFeature[] {
  const ownerByHex = new Map(territories.map((t) => [t.h3Index, t.ownerId]));
  const features: TerritoryBorderFeature[] = [];

  for (const t of territories) {
    for (const edge of originToDirectedEdges(t.h3Index)) {
      const neighbor = getDirectedEdgeDestination(edge);
      const neighborOwner = ownerByHex.get(neighbor);

      if (neighborOwner === t.ownerId) continue; // same owner both sides: no frontier here
      if (neighborOwner !== undefined && neighbor < t.h3Index) continue; // the other side already emitted this edge

      features.push({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: directedEdgeToBoundary(edge, true) as [number, number][] },
      });
    }
  }

  return features;
}
