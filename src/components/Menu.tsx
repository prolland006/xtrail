"use client";

import { AppBar, Avatar, Box, IconButton, Stack, Toolbar, Tooltip, Typography } from "@mui/material";
import LogoutIcon from "@mui/icons-material/Logout";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import LanguageChanger from "./LanguageChanger";

export default function Menu() {
  const { t, i18n } = useTranslation("menu");
  const { data: session } = useSession();
  const currentLocale = i18n.language;
  const router = useRouter();

  const handleLogout = async (e: any) => {
    e.preventDefault();
    signOut();
    router.push(`/${currentLocale}/login`);
  };

  const initials = (session?.user?.name || session?.user?.email || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <AppBar position="static" elevation={2} sx={{ bgcolor: "primary.dark" }}>
      <Toolbar sx={{ gap: 3.5, py: 1 }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M2 19L9 6L13 14L16 9L22 19H2Z" fill="#fff" opacity="0.95" />
          </svg>
          <Typography variant="subtitle1" fontWeight={700} letterSpacing="-0.01em">
            XTrail
          </Typography>
        </Stack>

        <Stack direction="row" spacing={2.5}>
          <Typography
            component={Link}
            href="/"
            variant="body2"
            fontWeight={600}
            sx={{ color: "#fff", textDecoration: "none" }}
          >
            {t("home")}
          </Typography>
          <Typography
            component={Link}
            href="/about"
            variant="body2"
            fontWeight={600}
            sx={{ color: "#fff", textDecoration: "none" }}
          >
            {t("about")}
          </Typography>
          <Typography
            component={Link}
            href="/map"
            variant="body2"
            fontWeight={600}
            sx={{ color: "#fff", textDecoration: "none" }}
          >
            {t("map")}
          </Typography>
        </Stack>

        <Box sx={{ flex: 1 }} />

        <LanguageChanger variant="onDark" />

        <Tooltip title={t("logout")}>
          <IconButton onClick={handleLogout} size="small" sx={{ color: "#fff" }}>
            <LogoutIcon fontSize="small" />
          </IconButton>
        </Tooltip>

        <Avatar
          sx={{
            width: 32,
            height: 32,
            bgcolor: "primary.light",
            color: "primary.dark",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {initials}
        </Avatar>
      </Toolbar>
    </AppBar>
  );
}
