import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { listRecentActivities, STRAVA_PROVIDER } from "@/lib/strava";
import { STRAVA_INITIAL_SYNC_DEFAULT_ACTIVITIES } from "@/config/stravaInitialSync";

function initialSyncActivityCount(): number {
  const configured = Number(process.env.STRAVA_INITIAL_SYNC_ACTIVITIES);
  return Number.isFinite(configured) && configured > 0 ? configured : STRAVA_INITIAL_SYNC_DEFAULT_ACTIVITIES;
}

/**
 * Runs once, right after a player connects Strava for the first time (see the OAuth callback
 * route) — a webhook subscription can only ever report activities created *after* it exists,
 * so this is what backfills a bounded amount of pre-existing history instead.
 *
 * Enqueues "create" ActivitySyncJob rows (one per activity) rather than importing directly:
 * the OAuth callback request stays fast (one Strava list call + a handful of inserts), and
 * processing goes through the exact same worker, retry, and idempotency logic a real-time
 * webhook event already gets (Phase 5) — no second import code path to maintain.
 */
export async function enqueueInitialStravaSync(playerId: number, athleteId: string, token: string): Promise<number> {
  const activities = await listRecentActivities(token, initialSyncActivityCount());
  if (activities.length === 0) return 0;

  // Skip activities already imported (e.g. picked up by the per-visit StravaConnect fallback,
  // or a reconnect after a prior disconnect) — no point queuing a job just to have the worker
  // fetch it again and find out it's a no-op.
  const providerActivityIds = activities.map((a) => String(a.id));
  const alreadyImported = await prisma.activity.findMany({
    where: { provider: STRAVA_PROVIDER, providerActivityId: { in: providerActivityIds } },
    select: { providerActivityId: true },
  });
  const alreadyImportedIds = new Set(alreadyImported.map((a) => a.providerActivityId));
  const toEnqueue = activities.filter((a) => !alreadyImportedIds.has(String(a.id)));

  if (toEnqueue.length === 0) {
    console.log(`Strava initial sync: player ${playerId} already has all ${activities.length} recent activities`);
    return 0;
  }

  const eventTime = new Date();
  let queued = 0;

  for (const activity of toEnqueue) {
    try {
      await prisma.activitySyncJob.create({
        data: {
          provider: STRAVA_PROVIDER,
          providerActivityId: String(activity.id),
          externalAccountId: athleteId,
          aspectType: "create",
          eventTime,
        },
      });
      queued++;
    } catch (err) {
      // Unique constraint on (provider, providerActivityId, aspectType, eventTime): only
      // reachable if this function somehow ran twice for the same player in the same instant.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") continue;
      throw err;
    }
  }

  console.log(`Strava initial sync: queued ${queued}/${toEnqueue.length} activities for player ${playerId}`);
  return queued;
}
