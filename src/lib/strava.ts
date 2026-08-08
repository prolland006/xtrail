import { prisma } from "@/lib/db";
import type { NormalizedActivity } from "@/lib/normalizedActivity";

// This module's provider identity — matches the "strava" value of the ActivityProvider enum.
export const STRAVA_PROVIDER = "strava" as const;

const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token";
const STRAVA_API_BASE = "https://www.strava.com/api/v3";

// Refresh a bit before the real expiry so a request that starts just before the token dies
// doesn't race the refresh.
const REFRESH_MARGIN_SECONDS = 60;

// Strava's raw activity payload shape (list endpoint and single-activity endpoint both return
// at least these fields). Only this module and its adapter below should ever read from it —
// everything past toNormalizedActivity() deals in NormalizedActivity instead.
export type Activity = {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  type: string;
  start_date_local: string;
  map?: {
    summary_polyline: string;
  };
};

type StravaTokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_at: number; // unix seconds
  // Only present on the initial authorization_code grant, never on a refresh_token grant.
  athlete?: { id: number };
};

export class StravaTokenExchangeError extends Error {}

// Exchanges an OAuth authorization code for tokens, right after the user grants access.
export async function exchangeCodeForToken(code: string): Promise<StravaTokenResponse> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new StravaTokenExchangeError(`Strava token exchange failed with status ${res.status}`);
  }

  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<StravaTokenResponse> {
  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new StravaTokenExchangeError(`Strava token refresh failed with status ${res.status}`);
  }

  return res.json();
}

// The adapter: translates Strava's own payload shape into the app's normalized activity —
// the one piece of business logic that's allowed to know Strava's field names. A future
// Garmin/Coros adapter would live in its own lib/<provider>.ts file with the equivalent
// function, both feeding the same services/activityImport.ts.
export function toNormalizedActivity(raw: Activity): NormalizedActivity {
  return {
    providerActivityId: String(raw.id),
    name: raw.name,
    type: raw.type,
    startDate: new Date(raw.start_date_local),
    distanceMeters: raw.distance,
    movingTimeSeconds: raw.moving_time,
    elevationGainMeters: raw.total_elevation_gain,
    polyline: raw.map?.summary_polyline || null,
  };
}

// The webhook and its jobs only ever carry the provider's own athlete/user id — this is how
// the worker turns that back into one of our players.
export async function getPlayerIdForAthlete(stravaAthleteId: string): Promise<number | null> {
  const connection = await prisma.externalConnection.findUnique({
    where: { providerAccount: { provider: STRAVA_PROVIDER, externalAccountId: stravaAthleteId } },
    select: { playerId: true },
  });
  return connection?.playerId ?? null;
}

/**
 * Returns a valid Strava access token for the given player, transparently refreshing and
 * persisting a new one first if the stored token is expired or close to it. Returns null if
 * the player has no linked Strava connection — callers treat that as "not connected", not an error.
 */
export async function getValidAccessTokenForPlayer(playerId: number): Promise<string | null> {
  const connection = await prisma.externalConnection.findUnique({
    where: { playerProvider: { playerId, provider: STRAVA_PROVIDER } },
  });
  if (!connection) return null;

  const expiresInSeconds = (connection.expiresAt.getTime() - Date.now()) / 1000;
  if (expiresInSeconds > REFRESH_MARGIN_SECONDS) {
    return connection.accessToken;
  }

  const refreshed = await refreshAccessToken(connection.refreshToken);

  await prisma.externalConnection.update({
    where: { playerProvider: { playerId, provider: STRAVA_PROVIDER } },
    data: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token,
      expiresAt: new Date(refreshed.expires_at * 1000),
    },
  });

  return refreshed.access_token;
}

// Used both for the per-visit "did anything new show up" check (perPage=1) and the initial
// backfill right after connecting (perPage=<STRAVA_INITIAL_SYNC_ACTIVITIES>, see
// services/stravaInitialSync.ts). Empty array on any error — callers treat "nothing to sync
// right now" the same as "temporarily unreachable" here, since both just mean try again later.
export async function listRecentActivities(token: string, perPage: number): Promise<Activity[]> {
  const res = await fetch(`${STRAVA_API_BASE}/athlete/activities?per_page=${perPage}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];

  return res.json();
}

export async function getLatestActivity(token: string): Promise<Activity | null> {
  const activities = await listRecentActivities(token, 1);
  return activities[0] ?? null;
}

export type FetchActivityResult =
  | { status: "ok"; activity: Activity }
  // The activity was deleted on Strava's side, or is no longer visible to this token
  // (e.g. privacy change) — both are terminal, not retryable.
  | { status: "not-found" }
  | { status: "rate-limited" }
  | { status: "error"; httpStatus: number };

// Used by the sync worker for create/update webhook events: the webhook payload only carries
// an activity id, never the activity data itself, so this is what actually fetches it.
export async function fetchActivityById(token: string, stravaActivityId: string): Promise<FetchActivityResult> {
  const res = await fetch(`${STRAVA_API_BASE}/activities/${stravaActivityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 404) return { status: "not-found" };
  if (res.status === 429) return { status: "rate-limited" };
  if (!res.ok) return { status: "error", httpStatus: res.status };

  const activity: Activity = await res.json();
  return { status: "ok", activity };
}
