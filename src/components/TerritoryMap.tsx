"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, LngLatBounds, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { hexagonBoundary } from "@/lib/h3";
import type { TerritoryView } from "@/services/territory";

// Free, no-account vector tiles (OpenFreeMap) — no API key required.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

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

// Pure rendering: every hexagon's shape and owner already come from the Territory table
// (see services/territory.ts) — this component never decodes a polyline or computes an H3
// cell from GPS data, it only turns known hexagon indexes into map geometry.
export default function TerritoryMap({ territories }: { territories: TerritoryView[] }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || territories.length === 0) return;

    const features = territories.map((territory) => ({
      type: "Feature" as const,
      properties: {
        color: colorForOwner(territory.ownerId),
        ownerName: `${territory.owner.firstName} ${territory.owner.lastName}`,
      },
      geometry: {
        type: "Polygon" as const,
        coordinates: [hexagonBoundary(territory.h3Index)],
      },
    }));

    const firstPoint = features[0].geometry.coordinates[0][0];
    const bounds = features.reduce((acc, feature) => {
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
      map.addSource("territories", {
        type: "geojson",
        data: { type: "FeatureCollection", features },
      });
      map.addLayer({
        id: "territories-fill",
        type: "fill",
        source: "territories",
        paint: { "fill-color": ["get", "color"], "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: "territories-outline",
        type: "line",
        source: "territories",
        paint: { "line-color": ["get", "color"], "line-width": 1, "line-opacity": 0.8 },
      });
    });

    return () => {
      map.remove();
    };
  }, [territories]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
