"use client";

import { useEffect, useRef, useState } from "react";
import { Map as MapLibreMap, LngLatBounds, NavigationControl, Popup, setWorkerUrl } from "maplibre-gl";
import type { FilterSpecification, LngLat, MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { TerritoryFillFeature, TerritoryBorderFeature } from "@/lib/h3";
import { DEFAULT_MAP_STYLE_ID, getMapStyle } from "@/map/mapStyles";
import MapStyleSelector from "@/map/MapStyleSelector";

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

type ColoredFillFeature = TerritoryFillFeature & {
  properties: TerritoryFillFeature["properties"] & { color: string };
};

// Filter value that can never match a real h3Index, used to "clear" the selected-outline layer
// (MapLibre has no setFilter(null) that means "match nothing").
const NO_SELECTION_FILTER = ["==", ["get", "h3Index"], ""] as unknown as FilterSpecification;

/**
 * Pure rendering: both the fill polygons and the frontier-only border lines already come
 * fully formed from the server (see lib/h3.ts#territoryFillFeatures / territoryBorderFeatures,
 * built from the persisted Territory table — see services/territory.ts). This component never
 * decodes a polyline, computes an H3 cell, or works out which hexagon edges are frontiers —
 * it only turns known GeoJSON into map layers and assigns display color, per the map
 * architecture rules (React components must never calculate H3 indexes). Choosing among base
 * map styles, and how territories look on hover/selection, are display-only concerns and stay
 * here too — see src/map/mapStyles.ts for the style registry and per-theme paint values.
 */
export default function TerritoryMap({
  fillFeatures,
  borderFeatures,
}: {
  fillFeatures: TerritoryFillFeature[];
  borderFeatures: TerritoryBorderFeature[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);

  // Latest colored fill / border features, read by the style.load handler below — a ref
  // rather than a closure variable so switching base styles (which re-fires style.load)
  // re-adds the layers without needing to recreate the whole map instance.
  const territoryDataRef = useRef<{ fill: ColoredFillFeature[]; borders: TerritoryBorderFeature[] }>({
    fill: [],
    borders: [],
  });

  // The currently selected base style, mirrored into a ref so the imperative MapLibre
  // callbacks (defined once, not re-created on every render) always read the latest value.
  const [styleId, setStyleId] = useState(DEFAULT_MAP_STYLE_ID);
  const styleIdRef = useRef(styleId);

  useEffect(() => {
    if (!containerRef.current || fillFeatures.length === 0) return;

    // Color is a display-only concern (not territory logic), so it's assigned here rather
    // than repeated in the server payload for every one of thousands of same-owner hexagons.
    const coloredFillFeatures: ColoredFillFeature[] = fillFeatures.map((feature) => ({
      ...feature,
      properties: { ...feature.properties, color: colorForOwner(feature.properties.ownerId) },
    }));
    territoryDataRef.current = { fill: coloredFillFeatures, borders: borderFeatures };

    const firstPoint = coloredFillFeatures[0].geometry.coordinates[0][0];
    const bounds = coloredFillFeatures.reduce((acc, feature) => {
      for (const coord of feature.geometry.coordinates[0]) acc.extend(coord);
      return acc;
    }, new LngLatBounds(firstPoint, firstPoint));

    const map = new MapLibreMap({
      container: containerRef.current,
      style: getMapStyle(styleIdRef.current).style,
      bounds,
      fitBoundsOptions: { padding: 48 },
    });
    mapRef.current = map;

    map.addControl(new NavigationControl(), "top-right");

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
        // dense scribble rather than readable borders (visible on a fresh account's default
        // view, which fits the whole span of every imported activity). The colored fill layer
        // has no such minzoom, so territories still read as soft colored regions before you
        // zoom in on them.
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
      mapRef.current = null;
      popup.remove();
      map.remove();
    };
    // styleId intentionally excluded: it only seeds the initial style. Switching styles later
    // goes through mapRef.current.setStyle() in handleSelectStyle below instead of re-running
    // this effect, so the map instance (camera position, hover/selection state) survives a
    // base-style change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fillFeatures, borderFeatures]);

  const handleSelectStyle = (id: string) => {
    styleIdRef.current = id;
    setStyleId(id);
    mapRef.current?.setStyle(getMapStyle(id).style);
  };

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      <MapStyleSelector styleId={styleId} onSelect={handleSelectStyle} />
    </div>
  );
}
