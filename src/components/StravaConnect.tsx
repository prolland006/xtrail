import { getValidAccessToken, getLatestActivity } from "@/lib/strava";
import StravaActivityCard from "./StravaActivityCard";

export default async function StravaConnect() {
  const token = await getValidAccessToken();

  if (!token) {
    return <StravaActivityCard activity={null} connected={false} />;
  }

  const activity = await getLatestActivity(token);

  return <StravaActivityCard activity={activity} connected={true} />;
}
