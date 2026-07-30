"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTranslation } from "react-i18next";
import i18nConfig from "@/i18nConfig";
import { MenuItem, Select, SelectChangeEvent } from "@mui/material";

export default function LanguageChanger({
  variant = "default",
}: {
  variant?: "default" | "onDark";
}) {
  const { i18n } = useTranslation();
  const currentLocale = i18n.language;
  const router = useRouter();
  const currentPathname = usePathname();

  const handleChange = (e: SelectChangeEvent) => {
    const newLocale = e.target.value;

    // set cookie for next-i18n-router
    const days = 30;
    const date = new Date();
    date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
    const expires = "; expires=" + date.toUTCString();
    document.cookie = `NEXT_LOCALE=${newLocale};expires=${expires};path=/`;

    // redirect to the new locale path
    if (
      currentLocale === i18nConfig.defaultLocale &&
      !i18nConfig.prefixDefault
    ) {
      router.push("/" + newLocale + currentPathname);
    } else {
      router.push(
        currentPathname.replace(`/${currentLocale}`, `/${newLocale}`)
      );
    }
  };

  const onDark = variant === "onDark";

  return (
    <Select
      value={currentLocale}
      onChange={handleChange}
      size="small"
      variant="standard"
      disableUnderline
      MenuProps={{ disableScrollLock: true }}
      sx={{
        fontSize: 13,
        fontWeight: 700,
        letterSpacing: "0.02em",
        borderRadius: 5,
        px: 1.25,
        py: 0.25,
        color: onDark ? "#fff" : "text.primary",
        bgcolor: onDark ? "rgba(255,255,255,0.16)" : "action.hover",
        "& .MuiSelect-icon": { color: onDark ? "#fff" : "text.secondary" },
        "& .MuiSelect-select": { py: 0.25, pr: "24px !important" },
      }}
    >
      <MenuItem value="en">EN</MenuItem>
      <MenuItem value="fr">FR</MenuItem>
    </Select>
  );
}
