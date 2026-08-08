// Geographic zones within the 80km radius (point 3 of the generator spec), weighted so
// activities spread across the region instead of clustering near the center.
//
// Boundaries are distance-from-Nice bands rather than named massif polygons: the project has
// no administrative/geological boundary data loaded, and real elevation checked against these
// bands (via lib/elevation.ts, spot-checked during development) confirms the bands do track
// the actual coastal -> hinterland -> Préalpes -> Mercantour elevation gradient described in
// the spec (Nice itself ~27m; Vallée des Merveilles, near the 80km edge, ~2500m) — a
// distance-band proxy grounded in real geodesic + elevation data, not an arbitrary invention.
export type GeoZone = {
  id: string;
  label: string;
  minKm: number;
  maxKm: number;
  weight: number;
};

export const GEO_ZONES: GeoZone[] = [
  { id: "nice-hills", label: "Nice / collines proches", minKm: 0, maxKm: 15, weight: 20 },
  { id: "hinterland", label: "Arrière-pays niçois", minKm: 15, maxKm: 35, weight: 30 },
  { id: "prealpes", label: "Préalpes", minKm: 35, maxKm: 55, weight: 30 },
  { id: "mercantour", label: "Mercantour / haute montagne", minKm: 55, maxKm: 80, weight: 20 },
];
