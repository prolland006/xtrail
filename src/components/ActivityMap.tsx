"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, LngLatBounds, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { decodePolyline } from "@/lib/polyline";
import { convexHull } from "@/lib/convexHull";

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

    const hull = convexHull(routeCoords);
    const hullRing = hull.length >= 3 ? [...hull, hull[0]] : null;

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

      if (hullRing) {
        map.addSource("route-hull", {
          type: "geojson",
          data: {
            type: "Feature",
            properties: {},
            geometry: { type: "Polygon", coordinates: [hullRing] },
          },
        });
        map.addLayer(
          {
            id: "route-hull-fill",
            type: "fill",
            source: "route-hull",
            paint: { "fill-color": "#35603f", "fill-opacity": 0.18 },
          },
          "route-line"
        );
        map.addLayer(
          {
            id: "route-hull-outline",
            type: "line",
            source: "route-hull",
            paint: { "line-color": "#2c4f34", "line-width": 1.5, "line-opacity": 0.7 },
          },
          "route-line"
        );
      }
    });

    return () => {
      map.remove();
    };
  }, [polyline]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
