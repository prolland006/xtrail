// Tunables for the fake dataset. Override the RNG seed via SEED_RANDOM_SEED to get a
// different (but still reproducible) dataset without editing this file.
export const RANDOM_SEED = 20260805;

// Total activities generated across all players, distributed with weighted-random assignment
// per player (see generators/players.ts's activityWeight) rather than a fixed per-player range
// — that's what lets this hit an exact total regardless of player count.
export const TOTAL_FAKE_ACTIVITIES = 5000;

// Strava's real activity IDs are currently far below this range, so fake seed ids here can
// never collide with a genuinely imported activity's providerActivityId. All seed activities
// are tagged provider "strava" regardless — this is a fake numeric id in that provider's id
// space, not a real one.
export const FAKE_PROVIDER_ACTIVITY_ID_BASE = 900_000_000_000;

// Territory recompute batch size: updateTerritoriesForHexagons() fires one query per
// hexagon via Promise.all, so touching thousands of hexagons at once is chunked to avoid
// exhausting the Prisma connection pool.
export const TERRITORY_RECOMPUTE_BATCH_SIZE = 300;

// Geographic bounds for generated fake activities — Nice, France, and a radius around it.
// A true geodesic radius (see lib/geo.ts haversineMeters), not a lat/lng bounding box.
export const FAKE_ACTIVITY_CENTER_LAT = 43.7102;
export const FAKE_ACTIVITY_CENTER_LON = 7.262;
export const FAKE_ACTIVITY_RADIUS_KM = 80;
