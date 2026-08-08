// The shape every provider adapter (Strava today, Garmin/Coros/... later) must produce before
// an activity reaches services/activityImport.ts. Defined here rather than in lib/strava.ts so
// the shared import/persistence logic never has to import anything provider-specific.
export type NormalizedActivity = {
  providerActivityId: string;
  name: string;
  type: string;
  startDate: Date;
  distanceMeters: number;
  movingTimeSeconds: number;
  elevationGainMeters: number;
  // Encoded using the same polyline algorithm lib/polyline.ts decodes — the storage/rendering
  // convention every provider adapter must produce, regardless of that provider's own native
  // track format. Strava's adapter passes its summary_polyline through unchanged; a future
  // provider whose native format differs would need to re-encode into this same format.
  polyline: string | null;
};
