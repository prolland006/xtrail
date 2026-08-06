import Menu from "@/components/Menu";
import initTranslations from "@/app/i18n";
import TranslationsProvider from "@/components/TranslationsProvider";
import { getTerritories } from "@/services/territory";
import { territoryFillFeatures, territoryBorderFeatures } from "@/lib/h3";
import { Box, Container, Typography } from "@mui/material";
import TerritoryMap from "@/components/TerritoryMap";

const i18nNamespaces = ["map"];

async function MapPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const { t } = await initTranslations(locale, i18nNamespaces);

  // The map's only data source: persisted territories, never a live recalculation from
  // activities or GPS tracks — see services/territory.ts.
  const territories = await getTerritories();

  return (
    <TranslationsProvider namespaces={i18nNamespaces} locale={locale}>
      <Menu />
      <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
        <Container maxWidth="md" sx={{ pt: 5, pb: 3 }}>
          <Typography variant="h4" fontWeight={700} letterSpacing="-0.01em" gutterBottom>
            {t("header")}
          </Typography>
        </Container>

        <Container maxWidth="md" sx={{ pb: 6 }}>
          {territories.length === 0 ? (
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
          ) : (
            <Box sx={{ height: 520, borderRadius: 3.5, overflow: "hidden", boxShadow: 1 }}>
              <TerritoryMap
                fillFeatures={territoryFillFeatures(territories)}
                borderFeatures={territoryBorderFeatures(territories)}
              />
            </Box>
          )}
        </Container>
      </Box>
    </TranslationsProvider>
  );
}

export default MapPage;
