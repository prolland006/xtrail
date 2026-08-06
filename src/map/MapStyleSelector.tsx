"use client";

import { useState } from "react";
import { IconButton, Menu, MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import MapIcon from "@mui/icons-material/Map";
import CheckIcon from "@mui/icons-material/Check";
import { MAP_STYLES } from "./mapStyles";

/**
 * Presentation only: lists the available base map styles and reports the user's choice via
 * onSelect. Never touches the map instance itself — TerritoryMap owns calling map.setStyle()
 * and re-adding the territory layers afterwards, so this component can stay ignorant of
 * MapLibre entirely.
 */
export default function MapStyleSelector({
  styleId,
  onSelect,
}: {
  styleId: string;
  onSelect: (id: string) => void;
}) {
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  return (
    <>
      <IconButton
        onClick={(e) => setAnchorEl(e.currentTarget)}
        aria-label="Changer de fond de carte"
        sx={{
          position: "absolute",
          bottom: 16,
          left: 16,
          bgcolor: "background.paper",
          boxShadow: 2,
          "&:hover": { bgcolor: "background.paper" },
        }}
      >
        <MapIcon />
      </IconButton>

      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={() => setAnchorEl(null)}>
        {MAP_STYLES.map((option) => (
          <MenuItem
            key={option.id}
            selected={option.id === styleId}
            onClick={() => {
              onSelect(option.id);
              setAnchorEl(null);
            }}
            sx={{ alignItems: "flex-start", py: 1 }}
          >
            <ListItemIcon sx={{ mt: "2px" }}>
              {option.id === styleId ? <CheckIcon fontSize="small" /> : null}
            </ListItemIcon>
            <ListItemText
              primary={option.label}
              secondary={option.description}
              secondaryTypographyProps={{ sx: { whiteSpace: "normal", maxWidth: 220 } }}
            />
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
