import { prisma } from "@/lib/db";

export type RecentActivity = {
  id: number;
  name: string;
  type: string;
  startDate: Date;
  distanceMeters: number;
  movingTimeSeconds: number;
  elevationGainMeters: number;
  polyline: string | null;
};

// Reads straight from the persisted Activity table, never Strava — activities land here via
// the existing import pipeline (services/activityImport.ts, triggered from StravaConnect on
// the home page). Most-recent-first matches the @@index([playerId, startDate]) on Activity.
export async function getRecentActivitiesForPlayer(playerId: number, limit = 10): Promise<RecentActivity[]> {
  return prisma.activity.findMany({
    where: { playerId },
    orderBy: { startDate: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      type: true,
      startDate: true,
      distanceMeters: true,
      movingTimeSeconds: true,
      elevationGainMeters: true,
      polyline: true,
    },
  });
}
