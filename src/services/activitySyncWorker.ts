import { prisma } from "@/lib/db";
import {
  STRAVA_PROVIDER,
  getValidAccessTokenForPlayer,
  getPlayerIdForAthlete,
  fetchActivityById,
  toNormalizedActivity,
} from "@/lib/strava";
import { importNormalizedActivity, updateActivityMetadata, deleteActivity } from "./activityImport";
import { ACTIVITY_SYNC_BATCH_SIZE, ACTIVITY_SYNC_MAX_ATTEMPTS } from "@/config/activitySync";
import type { ActivitySyncJob } from "@prisma/client";

/**
 * Claims up to ACTIVITY_SYNC_BATCH_SIZE oldest pending jobs by atomically flipping each one to
 * "processing" (guarded by `status: "pending"` in the WHERE clause, so a row already claimed
 * by a concurrent worker is silently skipped). A single worker process is assumed for V1 (see
 * Phase 1 architecture notes) — this guard is cheap insurance, not a requirement for correctness
 * today, and is what a future second worker instance would need anyway.
 */
async function claimPendingJobs(): Promise<ActivitySyncJob[]> {
  const candidates = await prisma.activitySyncJob.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: ACTIVITY_SYNC_BATCH_SIZE,
    select: { id: true },
  });

  const claimedIds: number[] = [];
  for (const { id } of candidates) {
    const { count } = await prisma.activitySyncJob.updateMany({
      where: { id, status: "pending" },
      data: { status: "processing", attempts: { increment: 1 } },
    });
    if (count === 1) claimedIds.push(id);
  }

  if (claimedIds.length === 0) return [];
  return prisma.activitySyncJob.findMany({ where: { id: { in: claimedIds } } });
}

async function completeJob(id: number): Promise<void> {
  await prisma.activitySyncJob.update({
    where: { id },
    data: { status: "completed", processedAt: new Date() },
  });
}

// Terminal but not an error (e.g. the activity is legitimately gone, or the player disconnected
// their account) — nothing left to do, so this is a success, not a retry candidate.
async function skipJob(id: number, reason: string): Promise<void> {
  console.log(`Activity sync job ${id}: skipped — ${reason}`);
  await prisma.activitySyncJob.update({
    where: { id },
    data: { status: "completed", processedAt: new Date(), lastError: reason },
  });
}

// Transient failure: goes back to "pending" so the next poll cycle retries it, until attempts
// run out — at which point it's left in "failed" for manual investigation.
async function failJob(id: number, attempts: number, error: string): Promise<void> {
  const giveUp = attempts >= ACTIVITY_SYNC_MAX_ATTEMPTS;
  await prisma.activitySyncJob.update({
    where: { id },
    data: { status: giveUp ? "failed" : "pending", lastError: error.slice(0, 2000) },
  });
  console.error(`Activity sync job ${id}: ${giveUp ? "giving up after max attempts" : "will retry"} — ${error}`);
}

// Delete never needs the provider's API (the activity is already gone there) — provider-
// agnostic, so it's the one branch that runs before the provider dispatch below.
async function processDelete(job: ActivitySyncJob): Promise<void> {
  const result = await deleteActivity(job.provider, job.providerActivityId);
  console.log(`Activity sync job ${job.id}: activity ${job.providerActivityId} ${result.status}`);
  return completeJob(job.id);
}

// Only Strava exists today, so this is a single branch rather than a provider registry —
// see the "provider isolation" audit notes. Adding Garmin means adding a `case "garmin":`
// here that calls the equivalent functions from lib/garmin.ts, without touching anything else
// in this file or in services/activityImport.ts.
async function processCreateOrUpdate(job: ActivitySyncJob): Promise<void> {
  if (job.provider !== STRAVA_PROVIDER) {
    return skipJob(job.id, `no worker support for provider "${job.provider}"`);
  }

  const playerId = await getPlayerIdForAthlete(job.externalAccountId);
  if (playerId === null) {
    return skipJob(job.id, `no player linked to ${job.provider} athlete ${job.externalAccountId}`);
  }

  let token: string | null;
  try {
    token = await getValidAccessTokenForPlayer(playerId);
  } catch (err) {
    return failJob(job.id, job.attempts, `token refresh failed: ${err instanceof Error ? err.message : err}`);
  }

  if (!token) {
    return skipJob(job.id, `player ${playerId} has no ${job.provider} connection (disconnected?)`);
  }

  const fetched = await fetchActivityById(token, job.providerActivityId);

  if (fetched.status === "not-found") {
    // The create/update event's activity is already gone by the time we got to it — make sure
    // we don't keep a stale local copy around.
    await deleteActivity(job.provider, job.providerActivityId);
    return skipJob(job.id, "activity no longer exists on the provider");
  }

  if (fetched.status === "rate-limited") {
    return failJob(job.id, job.attempts, `${job.provider} API rate limit (429)`);
  }

  if (fetched.status === "error") {
    return failJob(job.id, job.attempts, `${job.provider} API error (HTTP ${fetched.httpStatus})`);
  }

  const normalized = toNormalizedActivity(fetched.activity);

  if (job.aspectType === "create") {
    const result = await importNormalizedActivity(playerId, job.provider, normalized);
    console.log(`Activity sync job ${job.id}: activity ${job.providerActivityId} ${result.status}`);
  } else {
    // "update": providers fire this for metadata changes only. If we don't have the activity
    // yet (its create event's job hasn't run, or was itself missed), fall back to a full import.
    const updateResult = await updateActivityMetadata(job.provider, job.providerActivityId, normalized);
    if (updateResult.status === "not-found") {
      await importNormalizedActivity(playerId, job.provider, normalized);
    }
    console.log(`Activity sync job ${job.id}: activity ${job.providerActivityId} update applied`);
  }

  return completeJob(job.id);
}

async function processJob(job: ActivitySyncJob): Promise<void> {
  console.log(`Activity sync job ${job.id}: processing ${job.aspectType} for ${job.provider} activity ${job.providerActivityId}`);

  if (job.aspectType === "delete") {
    return processDelete(job);
  }

  return processCreateOrUpdate(job);
}

// Entry point for both the standalone worker script and tests: claims one batch of pending
// jobs and processes them one at a time. Returns how many jobs were claimed, so a caller
// polling in a loop can log/back off appropriately.
export async function processPendingActivitySyncJobs(): Promise<number> {
  const jobs = await claimPendingJobs();

  for (const job of jobs) {
    try {
      await processJob(job);
    } catch (err) {
      console.error(`Activity sync job ${job.id}: unexpected error`, err);
      await failJob(job.id, job.attempts, err instanceof Error ? err.message : String(err));
    }
  }

  return jobs.length;
}
