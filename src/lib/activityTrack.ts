import { decodePolyline } from "./polyline";

export type ActivityTrackFeature = {
  type: "Feature";
  properties: Record<string, never>;
  geometry: { type: "LineString"; coordinates: [number, number][] };
};

// Turns a stored Strava polyline into a GeoJSON LineString ready for a map component to render
// as-is — pure geometry, same decode step already used at import time (see
// services/activityImport.ts), kept out of React components per the map architecture rules.
export function activityTrackFeature(polyline: string): ActivityTrackFeature {
  return {
    type: "Feature",
    properties: {},
    geometry: {
      type: "LineString",
      coordinates: decodePolyline(polyline).map(([lat, lng]) => [lng, lat]),
    },
  };
}
