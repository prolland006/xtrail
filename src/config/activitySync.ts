// How many pending ActivitySyncJob rows the worker claims per poll cycle.
export const ACTIVITY_SYNC_BATCH_SIZE = 5;

// A job stops being retried automatically (status -> "failed") after this many attempts.
export const ACTIVITY_SYNC_MAX_ATTEMPTS = 5;

// How often the standalone worker process (scripts/activityWorker.ts) polls for pending jobs.
export const ACTIVITY_SYNC_POLL_INTERVAL_MS = 15_000;
