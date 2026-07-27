"use client";

import { Button, Stack } from "@mui/material";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import LanguageChanger from "./LanguageChanger";
import { grey } from "@mui/material/colors";

export default function Menu() {
  const { t, i18n } = useTranslation("menu");
  const currentLocale = i18n.language;
  const router = useRouter();

  const handleLogout = async (e: any) => {
    e.preventDefault();
    signOut();
    router.push(`/${currentLocale}/login`);
  };

  return (
    <Stack direction={"row"} spacing={4} bgcolor={"lightgrey"} padding={4}>
      <Link href="/">{t("home")}</Link> <Link href="/about">{t("about")}</Link>{" "}
      <LanguageChanger />
      <Button variant="contained" onClick={handleLogout}>
        {t("logout")}
      </Button>
    </Stack>
  );
}
