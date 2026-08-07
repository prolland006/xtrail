"use client";

import { useState } from "react";
import { Box, Card, CardContent, Chip, Collapse, IconButton, Stack, Typography } from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { formatDuration, formatPace } from "@/lib/activityFormat";
import type { ActivityTrackFeature } from "@/lib/activityTrack";
import ActivityStat from "./ActivityStat";
import ActivityTrackMap from "./ActivityTrackMap";

export type ActivityListItem = {
  id: number;
  name: string;
  type: string;
  startDate: string;
  distanceMeters: number;
  movingTimeSeconds: number;
  elevationGainMeters: number;
  track: ActivityTrackFeature | null;
};

export default function ActivityListCard({ activity }: { activity: ActivityListItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardContent sx={{ p: 3 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
          <Box>
            <Typography variant="h6" fontWeight={700} sx={{ mb: 1 }}>
              {activity.name}
            </Typography>
            <Stack direction="row" spacing={1.5} alignItems="center" sx={{ mb: 3 }}>
              <Chip label={activity.type} size="small" sx={{ bgcolor: "primary.light", color: "#fff" }} />
              <Typography variant="body2" color="text.secondary">
                {new Date(activity.startDate).toLocaleDateString()}
              </Typography>
            </Stack>
          </Box>

          {activity.track && (
            <IconButton
              onClick={() => setExpanded((value) => !value)}
              size="small"
              aria-label={expanded ? "Réduire le tracé" : "Afficher le tracé"}
              sx={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
            >
              <ExpandMoreIcon />
            </IconButton>
          )}
        </Stack>

        <Stack direction="row" spacing={4}>
          <ActivityStat value={`${(activity.distanceMeters / 1000).toFixed(1)} km`} label="Distance" />
          <ActivityStat value={formatDuration(activity.movingTimeSeconds)} label="Durée" />
          <ActivityStat value={formatPace(activity.distanceMeters, activity.movingTimeSeconds)} label="Allure" />
        </Stack>
      </CardContent>

      {activity.track && (
        <Collapse in={expanded} unmountOnExit>
          <Box sx={{ height: 320, borderTop: "1px solid", borderColor: "divider" }}>
            <ActivityTrackMap track={activity.track} />
          </Box>
        </Collapse>
      )}
    </Card>
  );
}
