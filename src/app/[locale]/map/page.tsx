import Menu from "@/components/Menu";
import initTranslations from "@/app/i18n";
import TranslationsProvider from "@/components/TranslationsProvider";
import { getValidAccessToken, getLatestActivity } from "@/lib/strava";
import { Box, Container, Typography } from "@mui/material";
import ActivityMap from "@/components/ActivityMap";

const i18nNamespaces = ["map"];

async function MapPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const { t } = await initTranslations(locale, i18nNamespaces);

  const token = await getValidAccessToken();
  const activity = token ? await getLatestActivity(token) : null;
  const polyline = activity?.map?.summary_polyline;

  return (
    <TranslationsProvider namespaces={i18nNamespaces} locale={locale}>
      <Menu />
      <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
        <Container maxWidth="md" sx={{ pt: 5, pb: 3 }}>
          <Typography variant="h4" fontWeight={700} letterSpacing="-0.01em" gutterBottom>
            {t("header")}
          </Typography>
          {activity && (
            <Typography color="text.secondary">{activity.name}</Typography>
          )}
        </Container>

        <Container maxWidth="md" sx={{ pb: 6 }}>
          {!polyline ? (
            <Box
              sx={{
                p: 4,
                borderRadius: 3.5,
                bgcolor: "background.paper",
                border: "1.5px dashed",
                borderColor: "divider",
              }}
            >
              <Typography color="text.secondary">{t("noRoute")}</Typography>
            </Box>
          ) : (
            <Box sx={{ height: 520, borderRadius: 3.5, overflow: "hidden", boxShadow: 1 }}>
              <ActivityMap polyline={polyline} />
            </Box>
          )}
        </Container>
      </Box>
    </TranslationsProvider>
  );
}

export default MapPage;
