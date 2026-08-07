"use client";

import { useEffect, useRef } from "react";
import { Map as MapLibreMap, LngLatBounds, NavigationControl, setWorkerUrl } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { ActivityTrackFeature } from "@/lib/activityTrack";
import { DEFAULT_MAP_STYLE_ID, getMapStyle } from "@/map/mapStyles";

// See TerritoryMap.tsx for why the worker URL is pointed at the static copy rather than
// left at MapLibre's default (import.meta.url resolution breaks under Next.js's bundling).
setWorkerUrl("/maplibre-gl-worker.mjs");

/**
 * Pure rendering: the track's coordinates already come fully formed from the server (decoded
 * from the activity's stored polyline — see lib/activityTrack.ts). This component never
 * decodes a polyline itself, it only turns known GeoJSON into a map layer, per the map
 * architecture rules.
 */
export default function ActivityTrackMap({ track }: { track: ActivityTrackFeature }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const coordinates = track.geometry.coordinates;
    if (!container || coordinates.length === 0) return;

    const bounds = coordinates.reduce(
      (acc, coord) => acc.extend(coord),
      new LngLatBounds(coordinates[0], coordinates[0])
    );

    const map = new MapLibreMap({
      container,
      style: getMapStyle(DEFAULT_MAP_STYLE_ID).style,
      bounds,
      fitBoundsOptions: { padding: 32 },
    });

    map.addControl(new NavigationControl(), "top-right");

    map.on("style.load", () => {
      map.addSource("activity-track", { type: "geojson", data: track });
      map.addLayer({
        id: "activity-track",
        type: "line",
        source: "activity-track",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": "#ea580c", "line-width": 3.5, "line-opacity": 0.9 },
      });
    });

    // This map mounts inside a Collapse panel (see ActivityListCard) whose height animates
    // from 0 on expand — without tracking the container's actual size, MapLibre would keep
    // rendering at whatever size it had at construction time instead of filling the panel.
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
    };
  }, [track]);

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
