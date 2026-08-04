import { latLngToCell, cellToBoundary, getHexagonEdgeLengthAvg } from "h3-js";

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

// Coords are [lng, lat] pairs (GeoJSON/MapLibre order). Returns the set of H3 cell indexes the
// route passes through at the given resolution.
export function hexagonsForRoute(coords: [number, number][], resolution: number): string[] {
  const edgeMeters = getHexagonEdgeLengthAvg(resolution, "m");
  const densified = densify(coords, edgeMeters);
  const cells = new Set<string>();

  for (const [lng, lat] of densified) {
    cells.add(latLngToCell(lat, lng, resolution));
  }

  return Array.from(cells);
}

// Returns a closed ring of [lng, lat] pairs suitable for a GeoJSON Polygon.
export function hexagonBoundary(h3Index: string): [number, number][] {
  const boundary = cellToBoundary(h3Index, true) as [number, number][];
  const first = boundary[0];
  const last = boundary[boundary.length - 1];
  const alreadyClosed = first[0] === last[0] && first[1] === last[1];
  return alreadyClosed ? boundary : [...boundary, first];
}
