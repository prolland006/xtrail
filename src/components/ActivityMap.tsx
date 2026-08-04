"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, LngLatBounds, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { decodePolyline } from "@/lib/polyline";
import { hexagonBoundary, hexagonsForRoute, resolutionForDiameterMeters } from "@/lib/h3";
import { HEX_DIAMETER_METERS } from "@/config/h3";

// Free, no-account vector tiles (OpenFreeMap) — no API key required.
const MAP_STYLE = "https://tiles.openfreemap.org/styles/positron";

// MapLibre resolves its worker script relative to import.meta.url, which Next.js's webpack
// bundling doesn't rewrite correctly — the worker request ends up hitting a page route instead
// of the JS file. Serving it as a static asset (copied by scripts/copy-maplibre-worker.js) and
// pointing MapLibre at it directly works around this.
setWorkerUrl("/maplibre-gl-worker.mjs");

export default function ActivityMap({ polyline }: { polyline: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const routeCoords: [number, number][] = decodePolyline(polyline).map(([lat, lng]) => [lng, lat]);
    if (routeCoords.length === 0) return;

    const bounds = routeCoords.reduce(
      (acc, coord) => acc.extend(coord),
      new LngLatBounds(routeCoords[0], routeCoords[0])
    );

    const resolution = resolutionForDiameterMeters(HEX_DIAMETER_METERS);
    const hexFeatures = hexagonsForRoute(routeCoords, resolution).map((h3Index) => ({
      type: "Feature" as const,
      properties: {},
      geometry: { type: "Polygon" as const, coordinates: [hexagonBoundary(h3Index)] },
    }));

    const map = new MapLibreMap({
      container: containerRef.current,
      style: MAP_STYLE,
      bounds,
      fitBoundsOptions: { padding: 48 },
    });

    map.addControl(new NavigationControl(), "top-right");

    map.on("load", () => {
      map.addSource("route", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: { type: "LineString", coordinates: routeCoords },
        },
      });
      map.addLayer({
        id: "route-line",
        type: "line",
        source: "route",
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#fc4c02", "line-width": 3 },
      });

      map.addSource("hexagons", {
        type: "geojson",
        data: { type: "FeatureCollection", features: hexFeatures },
      });
      map.addLayer(
        {
          id: "hexagons-fill",
          type: "fill",
          source: "hexagons",
          paint: { "fill-color": "#35603f", "fill-opacity": 0.18 },
        },
        "route-line"
      );
      map.addLayer(
        {
          id: "hexagons-outline",
          type: "line",
          source: "hexagons",
          paint: { "line-color": "#2c4f34", "line-width": 1, "line-opacity": 0.5 },
        },
        "route-line"
      );
    });

    return () => {
      map.remove();
    };
  }, [polyline]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
