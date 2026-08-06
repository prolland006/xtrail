"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, LngLatBounds, NavigationControl, setWorkerUrl } from "maplibre-gl";
import type { StyleSpecification } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TerritoryFillFeature, TerritoryBorderFeature } from "@/lib/h3";

// OpenTopoMap: free, no-account hiking/topo raster tiles (contours, trails, relief shading).
// Their usage policy (https://opentopomap.org/about#verwendung) allows light traffic without
// a key but asks heavy users to self-host — fine for this app's current scale, revisit if
// map traffic grows. Max zoom 17 is the topo data's actual resolution; MapLibre upscales past
// that rather than requesting tiles the server doesn't have.
const MAP_STYLE: StyleSpecification = {
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

// MapLibre resolves its worker script relative to import.meta.url, which Next.js's webpack
// bundling doesn't rewrite correctly — the worker request ends up hitting a page route instead
// of the JS file. Serving it as a static asset (copied by scripts/copy-maplibre-worker.js) and
// pointing MapLibre at it directly works around this.
setWorkerUrl("/maplibre-gl-worker.mjs");

// Deterministic per-owner color: the golden angle spreads consecutive owner IDs across
// hues that stay visually distinct even for many owners, with no palette to run out of.
function colorForOwner(ownerId: number): string {
  const hue = (ownerId * 137.508) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

/**
 * Pure rendering: both the fill polygons and the frontier-only border lines already come
 * fully formed from the server (see lib/h3.ts#territoryFillFeatures / territoryBorderFeatures,
 * built from the persisted Territory table — see services/territory.ts). This component never
 * decodes a polyline, computes an H3 cell, or works out which hexagon edges are frontiers —
 * it only turns known GeoJSON into map layers and assigns display color, per the map
 * architecture rules (React components must never calculate H3 indexes).
 */
export default function TerritoryMap({
  fillFeatures,
  borderFeatures,
}: {
  fillFeatures: TerritoryFillFeature[];
  borderFeatures: TerritoryBorderFeature[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || fillFeatures.length === 0) return;

    // Color is a display-only concern (not territory logic), so it's assigned here rather
    // than repeated in the server payload for every one of thousands of same-owner hexagons.
    const coloredFillFeatures = fillFeatures.map((feature) => ({
      ...feature,
      properties: { ...feature.properties, color: colorForOwner(feature.properties.ownerId) },
    }));

    const firstPoint = coloredFillFeatures[0].geometry.coordinates[0][0];
    const bounds = coloredFillFeatures.reduce((acc, feature) => {
      for (const coord of feature.geometry.coordinates[0]) acc.extend(coord);
      return acc;
    }, new LngLatBounds(firstPoint, firstPoint));

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      bounds,
      fitBoundsOptions: { padding: 48 },
    });

    map.addControl(new NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("territories-fill", {
        type: "geojson",
        data: { type: "FeatureCollection", features: coloredFillFeatures },
      });
      map.addLayer({
        id: "territories-fill",
        type: "fill",
        source: "territories-fill",
        // fill-outline-color defaults to fill-color when unset, which would draw a visible
        // edge on every single hexagon (not just territory frontiers) — set to transparent so
        // the only borders on the map come from the dedicated frontier layer below.
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.09, "fill-outline-color": "transparent" },
      });

      // Only actual frontier edges reach this source (different owners, or an owner against
      // unclaimed ground) — see territoryBorderFeatures — so this draws territory outlines
      // rather than a full hexagon grid. One neutral style for every frontier: which side
      // "owns" a shared edge is arbitrary, so tying border color to an owner would be
      // misleading.
      map.addSource("territories-borders", {
        type: "geojson",
        data: { type: "FeatureCollection", features: borderFeatures },
      });
      map.addLayer({
        id: "territories-borders",
        type: "line",
        source: "territories-borders",
        paint: { "line-color": "#1f2937", "line-width": 1, "line-opacity": 0.35 },
      });
    });

    return () => {
      map.remove();
    };
  }, [fillFeatures, borderFeatures]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
