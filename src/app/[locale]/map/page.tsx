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
      <Box sx={{ display: "flex", flexDirection: "column", height: "100vh" }}>
        <Menu />
        <Box sx={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", bgcolor: "background.default" }}>
          {territories.length === 0 ? (
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
              <TerritoryMap
                fillFeatures={territoryFillFeatures(territories)}
                borderFeatures={territoryBorderFeatures(territories)}
              />
            </Box>
          )}
        </Box>
      </Box>
    </TranslationsProvider>
  );
}

export default MapPage;
