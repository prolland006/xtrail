// Tunables for the fake dataset. Override the RNG seed via SEED_RANDOM_SEED to get a
// different (but still reproducible) dataset without editing this file.
export const RANDOM_SEED = 20260805;

export const MIN_ACTIVITIES_PER_PLAYER = 15;
export const MAX_ACTIVITIES_PER_PLAYER = 45;

// Strava's real activity IDs are currently far below this range, so fake seed IDs here
// can never collide with a genuinely imported activity's stravaId.
export const FAKE_STRAVA_ID_BASE = 900_000_000_000;

// Territory recompute batch size: updateTerritoriesForHexagons() fires one query per
// hexagon via Promise.all, so touching thousands of hexagons at once is chunked to avoid
// exhausting the Prisma connection pool.
export const TERRITORY_RECOMPUTE_BATCH_SIZE = 300;
