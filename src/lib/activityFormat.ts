// Shared display formatting for activity stats — used by both the home page's latest-activity
// card and the activities list, so pace/duration read identically everywhere.

export function formatPace(distanceMeters: number, movingTimeSeconds: number) {
  if (!distanceMeters) return "—";
  const secondsPerKm = movingTimeSeconds / (distanceMeters / 1000);
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}/km`;
}

export function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h${minutes.toString().padStart(2, "0")}` : `${minutes} min`;
}
