// Very rough approximation of the Alpes-Maritimes coastline (Antibes -> Nice -> Villefranche
// -> Monaco -> Menton), used only to stop generated trail routes from wandering into the
// Mediterranean. Not a precise coastline — a handful of control points, piecewise-linearly
// interpolated, biased slightly north of the real coast as a safety margin.
const COASTLINE: [lng: number, lat: number][] = [
  [6.85, 43.615],
  [7.0, 43.63],
  [7.15, 43.65],
  [7.27, 43.69],
  [7.31, 43.685],
  [7.4, 43.715],
  [7.5, 43.76],
  [7.6, 43.79],
];

function seaBoundaryLat(lng: number): number {
  if (lng <= COASTLINE[0][0]) return COASTLINE[0][1];

  for (let i = 1; i < COASTLINE.length; i++) {
    const [lng0, lat0] = COASTLINE[i - 1];
    const [lng1, lat1] = COASTLINE[i];
    if (lng <= lng1) {
      const t = (lng - lng0) / (lng1 - lng0);
      return lat0 + (lat1 - lat0) * t;
    }
  }

  return COASTLINE[COASTLINE.length - 1][1];
}

// True south of the approximated coastline for the given point.
export function isOverSea(lat: number, lng: number): boolean {
  return lat < seaBoundaryLat(lng);
}
