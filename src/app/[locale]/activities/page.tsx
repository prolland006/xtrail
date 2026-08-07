import { Box, Container, Stack, Typography } from "@mui/material";
import Menu from "@/components/Menu";
import initTranslations from "@/app/i18n";
import TranslationsProvider from "@/components/TranslationsProvider";
import { getOrCreatePlayerForSession } from "@/lib/player";
import { getRecentActivitiesForPlayer } from "@/services/activities";
import { activityTrackFeature } from "@/lib/activityTrack";
import ActivityListCard from "@/components/ActivityListCard";

const i18nNamespaces = ["activities"];

async function ActivitiesPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const { t } = await initTranslations(locale, i18nNamespaces);

  // Reads only what's already been imported (see services/activities.ts) — this page never
  // calls Strava itself, matching the "React/page layer never queries Strava directly" rule.
  const player = await getOrCreatePlayerForSession();
  const activities = player ? await getRecentActivitiesForPlayer(player.id, 10) : [];

  const items = activities.map((activity) => ({
    id: activity.id,
    name: activity.name,
    type: activity.type,
    startDate: activity.startDate.toISOString(),
    distanceMeters: activity.distanceMeters,
    movingTimeSeconds: activity.movingTimeSeconds,
    elevationGainMeters: activity.elevationGainMeters,
    track: activity.polyline ? activityTrackFeature(activity.polyline) : null,
  }));

  return (
    <TranslationsProvider namespaces={i18nNamespaces} locale={locale}>
      <Menu />
      <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
        <Container maxWidth="md" sx={{ py: 5 }}>
          <Typography variant="h4" fontWeight={700} letterSpacing="-0.01em" gutterBottom>
            {t("header")}
          </Typography>

          {items.length === 0 ? (
            <Box
              sx={{
                mt: 3,
                p: 4,
                borderRadius: 3.5,
                bgcolor: "background.paper",
                border: "1.5px dashed",
                borderColor: "divider",
              }}
            >
              <Typography color="text.secondary">{t("empty")}</Typography>
            </Box>
          ) : (
            <Stack spacing={3} sx={{ mt: 3 }}>
              {items.map((activity) => (
                <ActivityListCard key={activity.id} activity={activity} />
              ))}
            </Stack>
          )}
        </Container>
      </Box>
    </TranslationsProvider>
  );
}

export default ActivitiesPage;
