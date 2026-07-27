"use client";

import { useTranslation } from "react-i18next";

export default function Home() {
  const { t } = useTranslation();

  return <h3>{t("greeting")}</h3>;
}
