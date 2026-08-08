// Realistic spread of activity distances (point 10 of the generator spec) — proportions are
// configurable here rather than every activity defaulting to the same ~20km.
export type DistanceBucket = { label: string; minKm: number; maxKm: number; weight: number };

export const DISTANCE_BUCKETS: DistanceBucket[] = [
  { label: "courte", minKm: 10, maxKm: 20, weight: 35 },
  { label: "intermediaire", minKm: 20, maxKm: 35, weight: 35 },
  { label: "longue", minKm: 35, maxKm: 50, weight: 20 },
  { label: "ultra", minKm: 50, maxKm: 80, weight: 10 },
];
