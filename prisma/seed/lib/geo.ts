// Spherical-geometry helpers for procedurally walking a route on the map. Separate from
// src/lib/h3.ts's haversineMeters (which is route-internal and not exported) since seed
// code intentionally doesn't reach into application internals.
const EARTH_RADIUS_METERS = 6371000;

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

function toDegrees(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineMeters(latA: number, lngA: number, latB: number, lngB: number): number {
  const dLat = toRadians(latB - latA);
  const dLng = toRadians(lngB - lngA);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a));
}

export function bearingBetween(latA: number, lngA: number, latB: number, lngB: number): number {
  const y = Math.sin(toRadians(lngB - lngA)) * Math.cos(toRadians(latB));
  const x =
    Math.cos(toRadians(latA)) * Math.sin(toRadians(latB)) -
    Math.sin(toRadians(latA)) * Math.cos(toRadians(latB)) * Math.cos(toRadians(lngB - lngA));
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

// Great-circle destination point given a start, bearing and distance.
export function destinationPoint(
  lat: number,
  lng: number,
  bearingDeg: number,
  distanceMeters: number
): [number, number] {
  const angularDistance = distanceMeters / EARTH_RADIUS_METERS;
  const bearing = toRadians(bearingDeg);
  const lat1 = toRadians(lat);
  const lng1 = toRadians(lng);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance) + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(lat1),
      Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [toDegrees(lat2), toDegrees(lng2)];
}
