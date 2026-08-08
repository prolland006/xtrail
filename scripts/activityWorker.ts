import { loadEnvConfig } from "@next/env";
import { ACTIVITY_SYNC_POLL_INTERVAL_MS } from "@/config/activitySync";

// A standalone process, run alongside `next start`/`next dev` (see package.json's
// "activity:worker" script) rather than a Next.js request handler — that's what lets it poll
// on its own schedule instead of only running when a request happens to come in. `@next/env`
// is already a dependency of `next` itself, so this reuses Next's own .env/.env.local loading
// instead of adding a new dependency (e.g. dotenv) just for this one script.
//
// Uses a dynamic import for the app code: static imports are hoisted and would evaluate
// lib/db.ts (which reads DATABASE_URL at construction) before loadEnvConfig below ever runs.
async function main() {
  loadEnvConfig(process.cwd());

  const { processPendingActivitySyncJobs } = await import("@/services/activitySyncWorker");

  let stopping = false;
  process.on("SIGINT", () => (stopping = true));
  process.on("SIGTERM", () => (stopping = true));

  console.log(`Activity sync worker: started (polling every ${ACTIVITY_SYNC_POLL_INTERVAL_MS}ms)`);

  while (!stopping) {
    try {
      const processed = await processPendingActivitySyncJobs();
      if (processed > 0) {
        console.log(`Activity sync worker: processed ${processed} job(s)`);
      }
    } catch (err) {
      console.error("Activity sync worker: poll cycle failed", err);
    }

    await new Promise((resolve) => setTimeout(resolve, ACTIVITY_SYNC_POLL_INTERVAL_MS));
  }

  console.log("Activity sync worker: stopped");
}

main();
