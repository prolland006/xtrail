import i18nConfig from "@/i18nConfig";
import "./globals.css";
import type { Metadata } from "next";
import { ReactNode } from "react";
import { dir } from "i18next";
import { inter } from "@/fonts";
import ThemeRegistry from "@/components/ThemeRegistry";
import SessionProvider from "@/components/SessionProvider";

export const metadata: Metadata = {
  title: "XTrail",
  description: "Suivi de sorties trail connecté à Strava",
};

export function generateStaticParams() {
  return i18nConfig.locales.map((locale: any) => ({ locale }));
}

export default function RootLayout({
  children,
  params: { locale },
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  return (
    <html lang={locale} dir={dir(locale)}>
      <body className={inter.className}>
        <SessionProvider>
          <ThemeRegistry>{children}</ThemeRegistry>
        </SessionProvider>
      </body>
    </html>
  );
}
