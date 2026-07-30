import { cookies } from "next/headers";

export type Activity = {
  id: number;
  name: string;
  distance: number;
  moving_time: number;
  type: string;
  start_date_local: string;
};

export async function getValidAccessToken() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get("strava_access_token")?.value;
  const refreshToken = cookieStore.get("strava_refresh_token")?.value;
  const expiresAt = cookieStore.get("strava_expires_at")?.value;

  if (!accessToken || !refreshToken) return null;

  // Si token expiré, on le refresh
  if (expiresAt && Date.now() / 1000 > Number.parseInt(expiresAt) - 60) {
    const res = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = await res.json();
    try {
      // Échoue silencieusement si appelé depuis un Server Component (cookies en lecture seule pendant le rendu) :
      // le token rafraîchi est quand même utilisable pour cette requête, juste pas persisté.
      const store = await cookies();
      store.set("strava_access_token", data.access_token, { httpOnly: true, maxAge: data.expires_in });
      store.set("strava_expires_at", data.expires_at.toString(), { httpOnly: true });
    } catch {}
    return data.access_token;
  }

  return accessToken;
}

export async function getLatestActivity(token: string): Promise<Activity | null> {
  const res = await fetch("https://www.strava.com/api/v3/athlete/activities?per_page=1", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;

  const activities: Activity[] = await res.json();
  return activities[0] ?? null;
}
