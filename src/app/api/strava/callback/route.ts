import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) return NextResponse.json({ error: "No code" }, { status: 400 });

  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  const data = await res.json();
  if (!res.ok) return NextResponse.json(data, { status: 400 });

  // On stocke tout en cookie httpOnly
  const response = NextResponse.redirect(`${process.env.NEXT_PUBLIC_BASE_URL}/`);
  response.cookies.set("strava_access_token", data.access_token, { httpOnly: true, maxAge: data.expires_in });
  response.cookies.set("strava_refresh_token", data.refresh_token, { httpOnly: true, maxAge: 60 * 60 * 24 * 30 });
  response.cookies.set("strava_expires_at", data.expires_at.toString(), { httpOnly: true });
  response.cookies.set("strava_athlete", JSON.stringify(data.athlete), { maxAge: 60 * 60 * 24 * 30 });

  return response;
}