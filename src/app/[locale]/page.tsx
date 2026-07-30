import Home from "@/components/Home";
import initTranslations from "../i18n";
import TranslationsProvider from "@/components/TranslationsProvider";
import Menu from "@/components/Menu";
import StravaConnect from "@/components/StravaConnect";

const i18nNamespaces = ["home"];

async function HomePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  await initTranslations(locale, i18nNamespaces);

  return (
    <TranslationsProvider namespaces={i18nNamespaces} locale={locale}>
      <Menu />
      <Home>
        <StravaConnect />
      </Home>
    </TranslationsProvider>
  );
}

export default HomePage;
