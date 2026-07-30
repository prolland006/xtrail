"use client";

import { Activity } from "@/lib/strava";
import { Box, Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";

function formatPace(distanceMeters: number, movingTimeSeconds: number) {
  if (!distanceMeters) return "—";
  const secondsPerKm = movingTimeSeconds / (distanceMeters / 1000);
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}/km`;
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return hours > 0 ? `${hours}h${minutes.toString().padStart(2, "0")}` : `${minutes} min`;
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <Box>
      <Typography
        sx={{
          fontFamily: 'ui-monospace, "Cascadia Mono", "SFMono-Regular", Consolas, monospace',
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}
      >
        {label}
      </Typography>
    </Box>
  );
}

export default function StravaActivityCard({
  activity,
  connected,
}: {
  activity: Activity | null;
  connected: boolean;
}) {
  if (!connected) {
    return (
      <Card variant="outlined" sx={{ borderStyle: "dashed", borderWidth: 1.5, boxShadow: "none" }}>
        <CardContent sx={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1.5, py: 3 }}>
          <Typography variant="overline" color="text.secondary" fontWeight={700}>
            Aucun compte lié
          </Typography>
          <Typography color="text.secondary" fontSize={14.5}>
            Connecte ton compte Strava pour afficher automatiquement tes sorties ici.
          </Typography>
          <Button href="/api/strava/auth" variant="contained" color="secondary" sx={{ mt: 1 }}>
            Se connecter à Strava
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!activity) {
    return (
      <Card>
        <CardContent>
          <Typography color="text.secondary">Aucune activité trouvée.</Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Typography
          variant="overline"
          color="text.secondary"
          fontWeight={700}
          sx={{ letterSpacing: "0.08em" }}
        >
          Dernière sortie
        </Typography>
        <Typography variant="h6" fontWeight={700} sx={{ mt: 0.5, mb: 1 }}>
          {activity.name}
        </Typography>
        <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
          <Chip
            label={activity.type}
            size="small"
            sx={{ bgcolor: "primary.light", color: "#fff" }}
          />
          <Typography variant="body2" color="text.secondary">
            {new Date(activity.start_date_local).toLocaleDateString()}
          </Typography>
        </Stack>

        <Stack direction="row" spacing={4}>
          <Stat value={`${(activity.distance / 1000).toFixed(1)} km`} label="Distance" />
          <Stat value={formatDuration(activity.moving_time)} label="Durée" />
          <Stat value={formatPace(activity.distance, activity.moving_time)} label="Allure" />
        </Stack>
      </CardContent>
    </Card>
  );
}
