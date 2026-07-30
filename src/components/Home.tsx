"use client";

import { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Box, Container, Typography } from "@mui/material";

export default function Home({ children }: { children: ReactNode }) {
  const { t } = useTranslation();

  return (
    <Box sx={{ bgcolor: "background.default", minHeight: "100vh" }}>
      <Box
        sx={{
          position: "relative",
          overflow: "hidden",
          bgcolor: "background.paper",
          borderBottom: "1px solid",
          borderColor: "divider",
          py: { xs: 5, md: 6 },
        }}
      >
        <Box
          component="svg"
          viewBox="0 0 400 90"
          preserveAspectRatio="none"
          sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.5 }}
        >
          <path
            d="M-10 70 Q 60 40 130 65 T 260 55 T 420 70"
            fill="none"
            stroke="#d7dbce"
            strokeWidth={1.5}
          />
          <path
            d="M-10 82 Q 70 55 140 78 T 270 68 T 420 82"
            fill="none"
            stroke="#d7dbce"
            strokeWidth={1.5}
          />
          <path
            d="M-10 94 Q 80 70 150 90 T 280 80 T 420 94"
            fill="none"
            stroke="#d7dbce"
            strokeWidth={1.5}
          />
        </Box>
        <Container maxWidth="md" sx={{ position: "relative" }}>
          <Typography variant="h4" fontWeight={700} letterSpacing="-0.01em" gutterBottom>
            {t("header")}
          </Typography>
          <Typography color="text.secondary">{t("greeting")}</Typography>
        </Container>
      </Box>

      <Container maxWidth="md" sx={{ py: 5, display: "flex", flexDirection: "column", gap: 3 }}>
        {children}
      </Container>
    </Box>
  );
}
