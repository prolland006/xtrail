import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { STRAVA_OAUTH_STATE_COOKIE } from "@/lib/stravaOAuthState";

// Starting the Strava OAuth flow requires an app session up front: the callback links the
// ExternalConnection to whichever Player that session resolves to, so there must be one.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/login`);
  }

  const state = randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: process.env.STRAVA_CLIENT_ID!,
    redirect_uri: process.env.STRAVA_REDIRECT_URI!,
    response_type: "code",
    scope: "read,activity:read_all",
    state,
  });

  const response = NextResponse.redirect(`https://www.strava.com/oauth/authorize?${params.toString()}`);

  // Short-lived, httpOnly: read back by the callback to confirm the redirect we're about to
  // receive really originated from the authorize request we just issued (CSRF protection).
  response.cookies.set(STRAVA_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    maxAge: 300,
    sameSite: "lax",
  });

  return response;
}
