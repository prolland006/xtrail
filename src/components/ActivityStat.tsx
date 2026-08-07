import { Box, Typography } from "@mui/material";

export default function ActivityStat({ value, label }: { value: string; label: string }) {
  return (
    <Box>
      <Typography
        sx={{
          fontFamily: 'ui-monospace, "Cascadia Mono", "SFMono-Regular", Consolas, monospace',
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
          fontSize: 22,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </Typography>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ textTransform: "uppercase", letterSpacing: "0.08em", fontWeight: 700 }}
      >
        {label}
      </Typography>
    </Box>
  );
}
