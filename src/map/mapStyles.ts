import type { StyleSpecification } from "maplibre-gl";
import trailExplorer from "./styles/trailExplorer.json";
import ultraNight from "./styles/ultraNight.json";
import territoryBattle from "./styles/territoryBattle.json";
import minimalRunner from "./styles/minimalRunner.json";
import activityExplorer from "./styles/activityExplorer.json";

export type MapTheme = "light" | "dark";

// How the territory fill/border layers render is decided here, per theme, independently of
// each base style's own JSON — a base style only draws the terrain/roads/labels backdrop.
// This is what keeps a dark style (Ultra Night) and a light one (everything else) both
// readable without editing the territory-rendering code in TerritoryMap.tsx itself.
export type TerritoryTheme = {
  fillOpacity: number;
  hoverFillOpacity: number;
  selectedFillOpacity: number;
  borderColor: string;
  borderWidth: number;
  borderOpacity: number;
  selectedBorderColor: string;
};

// OpenTopoMap: free, no-account hiking/topo raster tiles (contours, trails, relief shading).
// Their usage policy (https://opentopomap.org/about#verwendung) allows light traffic without
// a key but asks heavy users to self-host — fine for this app's current scale, revisit if
// map traffic grows. Max zoom 17 is the topo data's actual resolution; MapLibre upscales past
// that rather than requesting tiles the server doesn't have. Kept as a plain raster
// StyleSpecification (not a styles/*.json file like the vector styles below) since it has no
// OpenMapTiles layer schema to preserve.
const OPENTOPOMAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    opentopomap: {
      type: "raster",
      tiles: [
        "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
        "https://c.tile.opentopomap.org/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      maxzoom: 17,
      attribution:
        'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
    },
  },
  layers: [{ id: "opentopomap", type: "raster", source: "opentopomap" }],
};

export type MapStyleDefinition = {
  id: string;
  label: string;
  description: string;
  theme: MapTheme;
  style: StyleSpecification;
  territoryTheme: TerritoryTheme;
};

const LIGHT_TERRITORY_THEME: TerritoryTheme = {
  fillOpacity: 0.09,
  hoverFillOpacity: 0.22,
  selectedFillOpacity: 0.32,
  borderColor: "#1f2937",
  borderWidth: 1,
  borderOpacity: 0.35,
  selectedBorderColor: "#111827",
};

// A dark base needs a light border/fill to stay visible — the dark slate border used on light
// styles would all but disappear against Ultra Night's near-black background.
const DARK_TERRITORY_THEME: TerritoryTheme = {
  fillOpacity: 0.16,
  hoverFillOpacity: 0.3,
  selectedFillOpacity: 0.42,
  borderColor: "#e2e8f0",
  borderWidth: 1,
  borderOpacity: 0.45,
  selectedBorderColor: "#f8fafc",
};

// Territory Battle is the "game mode": ownership should read at a glance, so both fill and
// frontier borders get noticeably stronger presence than the general-purpose light theme.
const BATTLE_TERRITORY_THEME: TerritoryTheme = {
  fillOpacity: 0.28,
  hoverFillOpacity: 0.42,
  selectedFillOpacity: 0.55,
  borderColor: "#111827",
  borderWidth: 1.75,
  borderOpacity: 0.85,
  selectedBorderColor: "#000000",
};

// Each style JSON is a real MapLibre style (derived from OpenFreeMap's positron/dark styles —
// see scripts used to generate src/map/styles/*.json), not authored from scratch, so the actual
// OpenMapTiles vector schema (layer ids, source-layers, filters) stays correct. Adding a new
// style means adding one JSON file here plus one entry in this array — see the README-style
// comment on MAP_STYLES below for the exact steps.
// Each JSON file's inferred shape is its own literal union of layer paint keys, which differ
// file to file (a "background" layer's paint has no "line-color", etc.) — TypeScript is right
// that they're not structurally identical, but they're all still valid MapLibre styles, so the
// parameter is intentionally untyped here rather than pinned to one file's inferred shape.
function asStyle(json: unknown): StyleSpecification {
  return json as StyleSpecification;
}

/**
 * To add a new base map style:
 * 1. Add a `src/map/styles/<name>.json` file — a full MapLibre style (sources/sprite/glyphs/
 *    layers). Easiest path: fetch an existing OpenFreeMap style as JSON and edit its layer
 *    paint properties (see the generation notes in this module's git history), rather than
 *    authoring the ~50 OpenMapTiles layers from scratch.
 * 2. Import it above and add one entry to MAP_STYLES with an id, label, description, theme
 *    ("light" or "dark" — picks which TerritoryTheme applies), and the imported style.
 * 3. Nothing else changes: MapStyleSelector.tsx renders whatever is in this array, and
 *    TerritoryMap.tsx re-adds the territory layers automatically after every style switch.
 */
export const MAP_STYLES: MapStyleDefinition[] = [
  {
    id: "trail-explorer",
    label: "Trail Explorer",
    description: "Carte outdoor classique : sentiers bien visibles, routes secondaires discrètes.",
    theme: "light",
    style: asStyle(trailExplorer),
    territoryTheme: LIGHT_TERRITORY_THEME,
  },
  {
    id: "ultra-night",
    label: "Ultra Night",
    description: "Fond sombre à fort contraste, pensé pour la course de nuit.",
    theme: "dark",
    style: asStyle(ultraNight),
    territoryTheme: DARK_TERRITORY_THEME,
  },
  {
    id: "territory-battle",
    label: "Territory Battle",
    description: "Mode jeu : fond minimal, les territoires sont l'unique point focal.",
    theme: "light",
    style: asStyle(territoryBattle),
    territoryTheme: BATTLE_TERRITORY_THEME,
  },
  {
    id: "minimal-runner",
    label: "Minimal Runner",
    description: "Visualisation épurée : bâtiments retirés, routes réduites, focus territoires.",
    theme: "light",
    style: asStyle(minimalRunner),
    territoryTheme: LIGHT_TERRITORY_THEME,
  },
  {
    id: "activity-explorer",
    label: "Activity Explorer",
    description: "Fond neutre pour l'analyse d'entraînement — prêt à recevoir une future couche de heatmap.",
    theme: "light",
    style: asStyle(activityExplorer),
    territoryTheme: LIGHT_TERRITORY_THEME,
  },
  {
    id: "osm-rando",
    label: "OSM Rando",
    description: "Fond topographique OpenTopoMap : courbes de niveau, sentiers et relief ombré.",
    theme: "light",
    style: OPENTOPOMAP_STYLE,
    territoryTheme: LIGHT_TERRITORY_THEME,
  },
];

export const DEFAULT_MAP_STYLE_ID = MAP_STYLES[0].id;

export function getMapStyle(id: string): MapStyleDefinition {
  return MAP_STYLES.find((s) => s.id === id) ?? MAP_STYLES[0];
}
