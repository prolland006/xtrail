// Realistic trail-runner archetypes (point 9 of the generator spec). Each range is sampled
// uniformly per player so two players on the same profile still differ (point 12).
export type RiderProfile = {
  id: string;
  label: string;
  preferredDistanceKm: [number, number];
  // Flat-terrain pace.
  flatSpeedKmh: [number, number];
  // Vertical Ascent speed in Meters/hour — a more realistic climb-effort model than scaling
  // flat speed, since climbing cost depends on vertical gain, not horizontal distance.
  climbVamMetersPerHour: [number, number];
  // Multiplier applied to flat speed for descents (runners go faster downhill than flat,
  // hikers less so — technical descents are handled via technicalTolerance instead).
  descentSpeedFactor: [number, number];
  // 0-1: how much this profile seeks out climb-heavy routes when a zone offers a choice.
  climbTolerance: number;
  // 0-1: tolerance for sac_scale beyond hiking / steps-heavy segments (see edgeWeight in
  // osmGraphRoute.ts) — higher means less penalty for technical terrain.
  technicalTolerance: number;
  pausesPerHour: [number, number];
  pauseDurationMinutes: [number, number];
  // Relative frequency among generated players — doesn't need to sum to 100.
  weight: number;
};

export const RIDER_PROFILES: RiderProfile[] = [
  {
    id: "casual_trailer",
    label: "Traileur occasionnel",
    preferredDistanceKm: [8, 20],
    flatSpeedKmh: [7, 9],
    climbVamMetersPerHour: [350, 450],
    descentSpeedFactor: [1.15, 1.35],
    climbTolerance: 0.3,
    technicalTolerance: 0.3,
    pausesPerHour: [0.5, 1.5],
    pauseDurationMinutes: [1, 4],
    weight: 30,
  },
  {
    id: "regular_trailer",
    label: "Traileur régulier",
    preferredDistanceKm: [15, 32],
    flatSpeedKmh: [9, 11],
    climbVamMetersPerHour: [450, 600],
    descentSpeedFactor: [1.3, 1.5],
    climbTolerance: 0.55,
    technicalTolerance: 0.5,
    pausesPerHour: [0.2, 0.8],
    pauseDurationMinutes: [1, 3],
    weight: 32,
  },
  {
    id: "experienced_trailer",
    label: "Traileur confirmé",
    preferredDistanceKm: [25, 48],
    flatSpeedKmh: [10, 13],
    climbVamMetersPerHour: [600, 800],
    descentSpeedFactor: [1.4, 1.65],
    climbTolerance: 0.75,
    technicalTolerance: 0.75,
    pausesPerHour: [0.1, 0.4],
    pauseDurationMinutes: [1, 2],
    weight: 20,
  },
  {
    id: "ultra_runner",
    label: "Ultra-traileur",
    preferredDistanceKm: [40, 80],
    flatSpeedKmh: [8, 11],
    climbVamMetersPerHour: [500, 700],
    descentSpeedFactor: [1.25, 1.5],
    climbTolerance: 0.85,
    technicalTolerance: 0.8,
    pausesPerHour: [0.3, 0.9],
    pauseDurationMinutes: [2, 6],
    weight: 10,
  },
  {
    id: "hiker",
    label: "Randonneur",
    preferredDistanceKm: [8, 22],
    flatSpeedKmh: [3.8, 5.2],
    climbVamMetersPerHour: [250, 350],
    descentSpeedFactor: [1.0, 1.15],
    climbTolerance: 0.6,
    technicalTolerance: 0.35,
    pausesPerHour: [1, 3],
    pauseDurationMinutes: [3, 12],
    weight: 8,
  },
];
