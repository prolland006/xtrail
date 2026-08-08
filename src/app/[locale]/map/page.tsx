import Menu from "@/components/Menu";
import initTranslations from "@/app/i18n";
import TranslationsProvider from "@/components/TranslationsProvider";
import { getTerritoryCount, getTerritoryCenter } from "@/services/territory";
import { Box, Container, Typography } from "@mui/material";
import TerritoryMap from "@/components/TerritoryMap";

const i18nNamespaces = ["map"];

async function MapPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const { t } = await initTranslations(locale, i18nNamespaces);

  // Cheap existence/positioning checks only (an indexed count and an aggregate average) — the
  // map's actual territory data is loaded client-side per viewport, see components/
  // TerritoryMap.tsx and /api/territories. Loading every territory here like before doesn't
  // scale: measured at ~112k rows, that took 2.2s server-side and shipped a 93MB payload.
  const [territoryCount, center] = await Promise.all([getTerritoryCount(), getTerritoryCenter()]);

  return (
    <TranslationsProvider namespaces={i18nNamespaces} locale={locale}>
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <Menu />
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
          {territoryCount === 0 || !center ? (
            <Container maxWidth="md" sx={{ pt: 3, pb: 6 }}>
              <Box
                sx={{
                  p: 4,
                  borderRadius: 3.5,
                  bgcolor: "background.paper",
                  border: "1.5px dashed",
                  borderColor: "divider",
                }}
              >
                <Typography color="text.secondary">{t("empty")}</Typography>
              </Box>
            </Container>
          ) : (
            <Box sx={{ flex: 1, minHeight: 0 }}>
              <TerritoryMap initialCenter={center} />
            </Box>
          )}
        </Box>
      </Box>
    </TranslationsProvider>
  );
}

export default MapPage;
