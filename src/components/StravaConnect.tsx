import { getValidAccessToken, getLatestActivity } from "@/lib/strava";
import { getOrCreatePlayerForSession } from "@/lib/player";
import { importStravaActivity } from "@/services/activityImport";
import StravaActivityCard from "./StravaActivityCard";

export default async function StravaConnect() {
  const token = await getValidAccessToken();

  if (!token) {
    return <StravaActivityCard activity={null} connected={false} />;
  }

  const activity = await getLatestActivity(token);

  // Persist + process on every visit rather than only at connect time: cheap (no-op once
  // already imported, since Activity.stravaId is unique) and keeps territories fresh
  // without needing a cron job yet. A daily scheduled import across all players' accounts
  // is the natural replacement — see the map page notes on future scaling.
  if (activity) {
    const player = await getOrCreatePlayerForSession();
    if (player) {
      await importStravaActivity(player.id, activity);
    }
  }

  return <StravaActivityCard activity={activity} connected={true} />;
}
