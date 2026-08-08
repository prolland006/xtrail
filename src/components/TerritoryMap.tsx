"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import type { FilterSpecification, GeoJSONSource, LngLat, MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Box, CircularProgress } from "@mui/material";
import type { TerritoryFillFeature, TerritoryBorderFeature } from "@/lib/h3";
import { DEFAULT_MAP_STYLE_ID, getMapStyle } from "@/map/mapStyles";
import MapStyleSelector from "@/map/MapStyleSelector";

// MapLibre resolves its worker script relative to import.meta.url, which Next.js's webpack
// bundling doesn't rewrite correctly — the worker request ends up hitting a page route instead
// of the JS file. Serving it as a static asset (copied by scripts/copy-maplibre-worker.js) and
// pointing MapLibre at it directly works around this.
setWorkerUrl("/maplibre-gl-worker.mjs");

// A fixed "reasonable local area" zoom rather than fitting every territory in view on load —
// with data spread across an 80km radius, "fit everything" would mean starting zoomed out over
// the whole region, which is exactly the unscalable case this component now avoids.
const DEFAULT_ZOOM = 12;

// Deterministic per-owner color: the golden angle spreads consecutive owner IDs across
// hues that stay visually distinct even for many owners, with no palette to run out of.
function colorForOwner(ownerId: number): string {
  const hue = (ownerId * 137.508) % 360;
  return `hsl(${hue}, 65%, 45%)`;
}

type ColoredFillFeature = TerritoryFillFeature & {
  properties: TerritoryFillFeature["properties"] & { color: string };
};

type TerritoriesResponse = {
  fill: TerritoryFillFeature[];
  borders: TerritoryBorderFeature[];
  truncated: boolean;
};

// Filter value that can never match a real h3Index, used to "clear" the selected-outline layer
// (MapLibre has no setFilter(null) that means "match nothing").
const NO_SELECTION_FILTER = ["==", ["get", "h3Index"], ""] as unknown as FilterSpecification;

/**
 * Pure rendering, but data is fetched per viewport rather than received whole: on load and on
 * every pan/zoom, this asks /api/territories for just the territories visible in the current
 * bounds (see services/territory.ts#getTerritoriesInBounds) and swaps the GeoJSON sources'
 * data. Neither this component nor the API route it calls decodes a polyline, computes an H3
 * cell, or works out which hexagon edges are frontiers on the client — the fill/border GeoJSON
 * already comes fully formed from the server (lib/h3.ts), per the map architecture rules.
 * Choosing among base map styles, and how territories look on hover/selection, are display-only
 * concerns and stay here too — see src/map/mapStyles.ts for the style registry.
 */
export default function TerritoryMap({ initialCenter }: { initialCenter: { lat: number; lng: number } }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // Latest colored fill / border features, read by the style.load handler below — a ref
  // rather than a closure variable so switching base styles (which re-fires style.load)
  // re-adds the layers without needing to recreate the whole map instance, and so a viewport
  // refetch can update already-added sources directly via setData.
  const territoryDataRef = useRef<{ fill: ColoredFillFeature[]; borders: TerritoryBorderFeature[] }>({
    fill: [],
    borders: [],
  });

  // The currently selected base style, mirrored into a ref so the imperative MapLibre
  // callbacks (defined once, not re-created on every render) always read the latest value.
  const [styleId, setStyleId] = useState(DEFAULT_MAP_STYLE_ID);
  const styleIdRef = useRef(styleId);

  const [truncated, setTruncated] = useState(false);

  // Resolved once, before the map is ever created — either the visitor's real position or the
  // server-computed fallback (initialCenter). Waiting for this rather than creating the map at
  // initialCenter and flyTo-ing to the real position once it arrives avoids the map visibly
  // starting at the wrong place and animating over: it now only ever appears once at its final
  // position.
  const [resolvedCenter, setResolvedCenter] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;

    // --- TEMPORARY diagnostic logging (requested to investigate "map doesn't land exactly on
    // my position") — remove once the real position/accuracy the browser returns is known.
    console.log("[geo-debug] navigator.geolocation available:", "geolocation" in navigator);
    if ("permissions" in navigator) {
      navigator.permissions
        .query({ name: "geolocation" })
        .then((status) => {
          console.log("[geo-debug] Permission API state (before prompt):", status.state);
        })
        .catch((err) => console.log("[geo-debug] Permission API query failed:", err));
    } else {
      console.log("[geo-debug] navigator.permissions not available in this browser");
    }
    // --- end temporary setup ---

    if (!("geolocation" in navigator)) {
      setResolvedCenter(initialCenter);
      return;
    }

    // Client-side only: the coordinates never get sent to the server — the viewport fetch in
    // the effect below only ever sees the resulting map bounds, exactly like any other pan/
    // zoom. Falls back silently to initialCenter (the server-computed territory average) if
    // geolocation is unsupported, the user declines the permission prompt, or the request
    // times out — there's always a sensible map to show either way.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // TEMPORARY: full diagnostic dump of what the browser actually returned.
        console.log("[geo-debug] getCurrentPosition SUCCESS via navigator.geolocation.getCurrentPosition()", {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: position.coords.accuracy,
          altitude: position.coords.altitude,
          altitudeAccuracyMeters: position.coords.altitudeAccuracy,
          heading: position.coords.heading,
          speedMetersPerSecond: position.coords.speed,
          timestamp: new Date(position.timestamp).toISOString(),
        });

        if (cancelled) return;
        setResolvedCenter({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      (error) => {
        // TEMPORARY: surface the exact error code/message the browser gave.
        console.log("[geo-debug] getCurrentPosition ERROR", { code: error.code, message: error.message });
        console.info("Geolocation unavailable, using default map position:", error.message);

        if (cancelled) return;
        setResolvedCenter(initialCenter);
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    );

    return () => {
      cancelled = true;
    };
    // initialCenter is a fresh object every render from the server-rendered parent, but
    // conceptually static for the lifetime of this page view — depending on it would re-run
    // the geolocation prompt if this component ever re-rendered for an unrelated reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!containerRef.current || !resolvedCenter) return;

    const map = new MapLibreMap({
      container: containerRef.current,
      style: getMapStyle(styleIdRef.current).style,
      center: [resolvedCenter.lng, resolvedCenter.lat],
      zoom: DEFAULT_ZOOM,
    });
    mapRef.current = map;

    map.addControl(new NavigationControl(), "top-right");

    const applyTerritoryData = (fill: TerritoryFillFeature[], borders: TerritoryBorderFeature[]) => {
      // Color is a display-only concern (not territory logic), so it's assigned here rather
      // than repeated in the server payload for every one of thousands of same-owner hexagons.
      const coloredFill: ColoredFillFeature[] = fill.map((feature) => ({
        ...feature,
        properties: { ...feature.properties, color: colorForOwner(feature.properties.ownerId) },
      }));
      territoryDataRef.current = { fill: coloredFill, borders };

      const fillSource = map.getSource<GeoJSONSource>("territories-fill");
      const borderSource = map.getSource<GeoJSONSource>("territories-borders");
      fillSource?.setData({ type: "FeatureCollection", features: coloredFill });
      borderSource?.setData({ type: "FeatureCollection", features: borders });
    };

    // Aborts a still-in-flight fetch when a new one starts (e.g. rapid successive zooms) so a
    // slow, stale response can't overwrite what's already on screen for the current viewport.
    let inFlight: AbortController | null = null;

    const refreshTerritories = async () => {
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;

      const bounds = map.getBounds();
      const params = new URLSearchParams({
        minLat: String(bounds.getSouth()),
        maxLat: String(bounds.getNorth()),
        minLng: String(bounds.getWest()),
        maxLng: String(bounds.getEast()),
      });

      try {
        const res = await fetch(`/api/territories?${params}`, { signal: controller.signal });
        if (!res.ok) return;
        const data: TerritoriesResponse = await res.json();
        applyTerritoryData(data.fill, data.borders);
        setTruncated(data.truncated);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("Failed to load territories for viewport", err);
      }
    };

    // Fires after the initial style loads, and again every time setStyle() swaps the base
    // map — MapLibre drops runtime-added sources/layers on a style swap, so they need to be
    // re-added each time rather than only once on "load". Paint values come from the newly
    // selected style's territoryTheme, so a dark style gets light borders and vice versa.
    const addTerritoryLayers = () => {
      const { fill, borders } = territoryDataRef.current;
      const theme = getMapStyle(styleIdRef.current).territoryTheme;

      map.addSource("territories-fill", {
        type: "geojson",
        data: { type: "FeatureCollection", features: fill },
        // Lets MapLibre track feature-state (hover/selected) per hexagon using its own
        // h3Index rather than requiring a synthetic numeric id on every feature.
        promoteId: "h3Index",
      });
      map.addLayer({
        id: "territories-fill",
        type: "fill",
        source: "territories-fill",
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": [
            "case",
            ["boolean", ["feature-state", "selected"], false],
            theme.selectedFillOpacity,
            ["boolean", ["feature-state", "hover"], false],
            theme.hoverFillOpacity,
            theme.fillOpacity,
          ],
          // fill-outline-color defaults to fill-color when unset, which would draw a visible
          // edge on every single hexagon (not just territory frontiers) — set to transparent
          // so the only borders on the map come from the dedicated frontier layer below.
          "fill-outline-color": "transparent",
        },
      });

      // Only actual frontier edges reach this source (different owners, or an owner against
      // unclaimed ground) — see territoryBorderFeatures — so this draws territory outlines
      // rather than a full hexagon grid. One neutral style for every frontier: which side
      // "owns" a shared edge is arbitrary, so tying border color to an owner would be
      // misleading.
      map.addSource("territories-borders", {
        type: "geojson",
        data: { type: "FeatureCollection", features: borders },
      });
      map.addLayer({
        id: "territories-borders",
        type: "line",
        source: "territories-borders",
        // At HEX_DIAMETER_METERS ≈ 250m, a hexagon is only a few screen pixels wide below
        // zoom ~11 — thousands of frontier edges packed into that many pixels render as a
        // dense scribble rather than readable borders. The colored fill layer has no such
        // minzoom, so territories still read as soft colored regions before you zoom in.
        minzoom: 11,
        paint: {
          "line-color": theme.borderColor,
          "line-width": theme.borderWidth,
          "line-opacity": theme.borderOpacity,
        },
      });

      // Draws the *full* perimeter of whichever single hexagon is selected (unlike the
      // frontier layer above, which skips edges between same-owner neighbors) — reuses the
      // fill source's polygon geometry rather than a separate one. Filtered to match nothing
      // until a hexagon is actually selected.
      map.addLayer({
        id: "territories-selected-outline",
        type: "line",
        source: "territories-fill",
        filter: NO_SELECTION_FILTER,
        paint: {
          "line-color": theme.selectedBorderColor,
          "line-width": theme.borderWidth + 1.5,
          "line-opacity": 1,
        },
      });
    };

    map.on("style.load", addTerritoryLayers);
    map.on("load", refreshTerritories);
    map.on("moveend", refreshTerritories);

    // --- Hover, selection and the ownership popup. Registered once (not inside style.load)
    // since MapLibre keeps layer-filtered event listeners across a style swap even though the
    // layer itself gets removed and re-added under the same id. ---

    let hoveredId: string | null = null;
    let selectedId: string | null = null;

    const clearSelection = () => {
      if (selectedId !== null && map.getSource("territories-fill")) {
        map.setFeatureState({ source: "territories-fill", id: selectedId }, { selected: false });
      }
      selectedId = null;
      if (map.getLayer("territories-selected-outline")) {
        map.setFilter("territories-selected-outline", NO_SELECTION_FILTER);
      }
    };

    const popup = new Popup({ closeButton: true, closeOnClick: false, offset: 12 });
    popup.on("close", clearSelection);

    const showOwnerPopup = (lngLat: LngLat, feature: MapGeoJSONFeature) => {
      const ownerName = String(feature.properties?.ownerName ?? "");
      const ownerPresence = Number(feature.properties?.ownerPresence ?? 0);

      // Built via DOM APIs with textContent (not setHTML with a template string) so a player
      // name can never be interpreted as markup.
      const container = document.createElement("div");
      container.style.fontSize = "13px";
      container.style.lineHeight = "1.5";

      const title = document.createElement("div");
      title.style.fontWeight = "700";
      title.textContent = ownerName;
      container.appendChild(title);

      const presence = document.createElement("div");
      presence.style.color = "#6b7280";
      presence.textContent = `${ownerPresence} passage${ownerPresence > 1 ? "s" : ""}`;
      container.appendChild(presence);

      popup.setLngLat(lngLat).setDOMContent(container).addTo(map);
    };

    map.on("mousemove", "territories-fill", (e) => {
      if (!e.features?.length) return;
      const id = String(e.features[0].properties?.h3Index);
      if (id === hoveredId) return;
      if (hoveredId !== null) map.setFeatureState({ source: "territories-fill", id: hoveredId }, { hover: false });
      hoveredId = id;
      map.setFeatureState({ source: "territories-fill", id }, { hover: true });
      map.getCanvas().style.cursor = "pointer";
    });

    map.on("mouseleave", "territories-fill", () => {
      if (hoveredId !== null) map.setFeatureState({ source: "territories-fill", id: hoveredId }, { hover: false });
      hoveredId = null;
      map.getCanvas().style.cursor = "";
    });

    map.on("click", "territories-fill", (e) => {
      if (!e.features?.length) return;
      const feature = e.features[0];
      const id = String(feature.properties?.h3Index);

      if (id !== selectedId) {
        clearSelection();
        selectedId = id;
        map.setFeatureState({ source: "territories-fill", id }, { selected: true });
        if (map.getLayer("territories-selected-outline")) {
          map.setFilter("territories-selected-outline", ["==", ["get", "h3Index"], id]);
        }
      }
      showOwnerPopup(e.lngLat, feature);
    });

    // Clicking anywhere that isn't a territory hexagon deselects and closes the popup.
    map.on("click", (e) => {
      if (!map.getLayer("territories-fill")) return;
      const hits = map.queryRenderedFeatures(e.point, { layers: ["territories-fill"] });
      if (hits.length === 0) popup.remove();
    });

    return () => {
      inFlight?.abort();
      mapRef.current = null;
      popup.remove();
      map.remove();
    };
    // Runs once resolvedCenter is known (see the geolocation effect above) and never again:
    // switching styles later goes through mapRef.current.setStyle() in handleSelectStyle below
    // instead of re-running this effect, so the map instance (camera position, hover/selection
    // state) survives a base-style change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedCenter]);

  const handleSelectStyle = (id: string) => {
    styleIdRef.current = id;
    setStyleId(id);
    mapRef.current?.setStyle(getMapStyle(id).style);
  };

  if (!resolvedCenter) {
    return (
      <Box sx={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <MapStyleSelector styleId={styleId} onSelect={handleSelectStyle} />
      {truncated && (
        <div
          style={{
            position: "absolute",
            bottom: 12,
            left: 12,
            padding: "4px 10px",
            borderRadius: 8,
            background: "rgba(17, 24, 39, 0.75)",
            color: "white",
            fontSize: 12,
          }}
        >
          Zoomez pour voir plus de détail
        </div>
      )}
    </div>
  );
}
