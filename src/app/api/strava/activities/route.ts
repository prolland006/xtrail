import { NextResponse } from "next/server";
import { getValidAccessTokenForPlayer } from "@/lib/strava";
import { getOrCreatePlayerForSession } from "@/lib/player";

export async function GET() {
  const player = await getOrCreatePlayerForSession();
  if (!player) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const token = await getValidAccessTokenForPlayer(player.id);
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const res = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=1", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const activities = await res.json();
  return NextResponse.json(activities);
}
