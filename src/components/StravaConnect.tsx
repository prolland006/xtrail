import { getValidAccessTokenForPlayer, getLatestActivity, toNormalizedActivity, STRAVA_PROVIDER } from "@/lib/strava";
import { getOrCreatePlayerForSession } from "@/lib/player";
import { importNormalizedActivity } from "@/services/activityImport";
import StravaActivityCard from "./StravaActivityCard";

export default async function StravaConnect() {
  const player = await getOrCreatePlayerForSession();
  if (!player) {
    return <StravaActivityCard activity={null} connected={false} />;
  }

  const token = await getValidAccessTokenForPlayer(player.id);
  if (!token) {
    return <StravaActivityCard activity={null} connected={false} />;
  }

  const activity = await getLatestActivity(token);

  // Persist + process on every visit rather than only at connect time: cheap (no-op once
  // already imported, since (provider, providerActivityId) is unique) and keeps territories
  // fresh without needing a cron job yet. The webhook makes this redundant for real-time
  // updates; this stays as a harmless fallback in the meantime.
  if (activity) {
    await importNormalizedActivity(player.id, STRAVA_PROVIDER, toNormalizedActivity(activity));
  }

  return <StravaActivityCard activity={activity} connected={true} />;
}
