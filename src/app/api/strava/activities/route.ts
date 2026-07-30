import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/strava";

export async function GET() {
  const token = await getValidAccessToken();
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const res = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=1", {
    headers: { Authorization: `Bearer ${token}` },
  });

  const activities = await res.json();
  return NextResponse.json(activities);
}
