"use client";

import { Button, Stack } from "@mui/material";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export default function Login() {
  const { data: session, status } = useSession();
  const { t, i18n } = useTranslation();
  const router = useRouter();

  const handleLogin = async (e: any) => {
    e.preventDefault();
    const res = await signIn("credentials", {
      email: "patrice@yahoo.fr",
      password: "password",
      redirect: false,
    });
  };

  useEffect(() => {
    if (status === "authenticated" && session.user?.name) {
      router.push(`/${i18n.language}/about`);
    }
  }, [status, session, router, i18n.language]);

  return (
    <Stack>
      <h3>{t("loginMsg")}</h3>
      <Button variant="contained" onClick={handleLogin}>
        {t("login")}
      </Button>
    </Stack>
  );
}
