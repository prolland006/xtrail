export type Trailhead = { name: string; lat: number; lng: number; baseElevation: number };

// Real-world trailheads around Nice and the Mercantour massif, used only as starting
// points/flavor for generated routes — no real GPS tracks are used or reproduced.
export const TRAILHEADS: Trailhead[] = [
  { name: "Vallée des Merveilles", lat: 44.0891, lng: 7.4508, baseElevation: 1740 },
  { name: "Refuge de Nice", lat: 44.1975, lng: 7.4384, baseElevation: 2232 },
  { name: "Saint-Martin-Vésubie", lat: 44.0705, lng: 7.2545, baseElevation: 960 },
  { name: "Col de Turini", lat: 43.9976, lng: 7.3903, baseElevation: 1607 },
  { name: "Peira Cava", lat: 43.9878, lng: 7.3608, baseElevation: 1450 },
  // Coastal Nice trailheads were dropped: real shoreline geometry there (Baie des Anges,
  // Villefranche bay, Cap de Nice headland) is too fine-grained for the coastline.ts
  // approximation to reliably keep generated routes off the water. Utelle sits ~30km
  // inland in the Vésubie valley — the same safety margin as the other trailheads below —
  // while still giving a lower elevation, Nice-hinterland profile distinct from the high
  // Mercantour peaks.
  { name: "Utelle", lat: 43.9366, lng: 7.2028, baseElevation: 800 },
  { name: "Gorges de la Vésubie", lat: 43.9822, lng: 7.2432, baseElevation: 480 },
  { name: "Baisse de Valmasque", lat: 44.0654, lng: 7.4321, baseElevation: 2130 },
];
