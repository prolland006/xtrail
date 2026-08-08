import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { getOrCreatePlayerForSession } from "@/lib/player";
import { exchangeCodeForToken, STRAVA_PROVIDER } from "@/lib/strava";
import { STRAVA_OAUTH_STATE_COOKIE } from "@/lib/stravaOAuthState";
import { enqueueInitialStravaSync } from "@/services/stravaInitialSync";
import { prisma } from "@/lib/db";

function redirectHome(baseUrl: string, query?: string) {
  const response = NextResponse.redirect(`${baseUrl}/${query ? `?${query}` : ""}`);
  response.cookies.delete(STRAVA_OAUTH_STATE_COOKIE);
  return response;
}

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

  // The user declined the Strava authorization prompt — not an error, just a no-op.
  const deniedError = req.nextUrl.searchParams.get("error");
  if (deniedError) {
    console.warn(`Strava OAuth flow did not complete: ${deniedError}`);
    return redirectHome(baseUrl, "strava=denied");
  }

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const scope = req.nextUrl.searchParams.get("scope");
  const expectedState = req.cookies.get(STRAVA_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    console.warn("Strava OAuth callback rejected: missing or mismatched state");
    return redirectHome(baseUrl, "strava=invalid-state");
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return redirectHome(baseUrl, "strava=login-required");
  }

  let tokenResponse;
  try {
    tokenResponse = await exchangeCodeForToken(code);
  } catch (err) {
    console.error("Strava token exchange failed", err);
    return redirectHome(baseUrl, "strava=error");
  }

  const athleteId = tokenResponse.athlete?.id;
  if (!athleteId) {
    console.error("Strava token exchange response was missing an athlete id");
    return redirectHome(baseUrl, "strava=error");
  }

  const player = await getOrCreatePlayerForSession();
  if (!player) {
    return redirectHome(baseUrl, "strava=login-required");
  }

  // Checked before the upsert below: this is what distinguishes a first-time connect (where a
  // backfill of past history makes sense) from a reconnect/refresh of an existing link (where
  // it would just re-discover activities already imported).
  const wasAlreadyConnected = await prisma.externalConnection.findUnique({
    where: { playerProvider: { playerId: player.id, provider: STRAVA_PROVIDER } },
    select: { id: true },
  });

  const connectionData = {
    provider: STRAVA_PROVIDER,
    externalAccountId: String(athleteId),
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    expiresAt: new Date(tokenResponse.expires_at * 1000),
    scope,
  };

  try {
    await prisma.externalConnection.upsert({
      where: { playerProvider: { playerId: player.id, provider: STRAVA_PROVIDER } },
      create: { playerId: player.id, ...connectionData },
      update: connectionData,
    });
  } catch (err) {
    // Unique constraint on (provider, externalAccountId): this Strava account is already
    // linked to a different player. Reject rather than silently reassigning ownership.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      console.warn(`Strava athlete ${athleteId} is already linked to another player`);
      return redirectHome(baseUrl, "strava=already-linked");
    }
    throw err;
  }

  console.log(`Strava account linked for player ${player.id}`);

  if (!wasAlreadyConnected) {
    try {
      // Uses the token we just obtained directly rather than getValidAccessTokenForPlayer:
      // it's guaranteed fresh this request, so there's nothing to refresh or look up.
      await enqueueInitialStravaSync(player.id, String(athleteId), tokenResponse.access_token);
    } catch (err) {
      // Not fatal: the connection itself succeeded. The per-visit StravaConnect fallback and
      // future webhook events will still pick up activity from here.
      console.error(`Strava initial sync failed to enqueue for player ${player.id}`, err);
    }
  }

  return redirectHome(baseUrl, "strava=connected");
}
