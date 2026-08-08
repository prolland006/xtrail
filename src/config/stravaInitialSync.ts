// How many of a player's most recent Strava activities to backfill right after they connect
// for the first time. Overridable via STRAVA_INITIAL_SYNC_ACTIVITIES — deliberately bounded
// rather than unlimited (see services/stravaInitialSync.ts).
export const STRAVA_INITIAL_SYNC_DEFAULT_ACTIVITIES = 50;
