import styles from "../page.module.css";
import LanguageChanger from "@/components/LanguageChanger";
import TranslationsProvider from "@/components/TranslationsProvider";
import initTranslations from "@/app/i18n";
import Login from "@/components/Login";
import SessionProvider from "@/components/SessionProvider";

const i18nNamespaces = ["login"];

async function LoginPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  const { t } = await initTranslations(locale, i18nNamespaces);

  return (
    <TranslationsProvider namespaces={i18nNamespaces} locale={locale}>
      <main className={styles.main}>
        <SessionProvider>
          <Login />
        </SessionProvider>
        <LanguageChanger />
      </main>
    </TranslationsProvider>
  );
}

export default LoginPage;
