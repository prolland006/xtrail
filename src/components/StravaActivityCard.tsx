"use client";

import { Activity } from "@/lib/strava";
import { formatDuration, formatPace } from "@/lib/activityFormat";
import { Button, Card, CardContent, Chip, Stack, Typography } from "@mui/material";
import ActivityStat from "./ActivityStat";

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
          <ActivityStat value={`${(activity.distance / 1000).toFixed(1)} km`} label="Distance" />
          <ActivityStat value={formatDuration(activity.moving_time)} label="Durée" />
          <ActivityStat value={formatPace(activity.distance, activity.moving_time)} label="Allure" />
        </Stack>
      </CardContent>
    </Card>
  );
}
