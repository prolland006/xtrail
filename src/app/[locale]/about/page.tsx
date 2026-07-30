import Menu from "../../../components/Menu";
import TranslationsProvider from "@/components/TranslationsProvider";
import initTranslations from "@/app/i18n";
import { Box, Container, Typography } from "@mui/material";

const i18nNamespaces = ["about"];

async function About({ params: { locale } }: { params: { locale: string } }) {
  const { t } = await initTranslations(locale, i18nNamespaces);
  return (
    <TranslationsProvider namespaces={i18nNamespaces} locale={locale}>
      <Menu />
      <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
        <Container maxWidth="md" sx={{ py: 5 }}>
          <Typography variant="h4" fontWeight={700} letterSpacing="-0.01em">
            {t("about_header")}
          </Typography>
        </Container>
      </Box>
    </TranslationsProvider>
  );
}

export default About;
