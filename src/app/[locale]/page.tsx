import Home from "@/components/Home";
import styles from "./page.module.css";
import LanguageChanger from "@/components/LanguageChanger";
import Link from "next/link";
import initTranslations from "../i18n";
import TranslationsProvider from "@/components/TranslationsProvider";
import Menu from "@/components/Menu";

const i18nNamespaces = ["home"];

async function HomePage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const { t } = await initTranslations(locale, i18nNamespaces);

  return (
    <TranslationsProvider namespaces={i18nNamespaces} locale={locale}>
      <main className={styles.main}>
        <Menu />
        <h1>{t("header")}</h1>
        <Home />
      </main>
    </TranslationsProvider>
  );
}

export default HomePage;
