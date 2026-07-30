import TranslationsProvider from "@/components/TranslationsProvider";
import initTranslations from "@/app/i18n";
import Login from "@/components/Login";
import Menu from "@/components/Menu";
import { Box } from "@mui/material";

const i18nNamespaces = ["login"];

async function LoginPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  await initTranslations(locale, i18nNamespaces);

  return (
    <TranslationsProvider namespaces={i18nNamespaces} locale={locale}>
      <Menu />
      <Box
        sx={{
          bgcolor: "background.default",
          minHeight: "calc(100vh - 64px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Login />
      </Box>
    </TranslationsProvider>
  );
}

export default LoginPage;
