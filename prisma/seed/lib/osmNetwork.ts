import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { haversineMeters } from "./geo";

// Public Overpass instances. overpass-api.de is the canonical one but its shared pool
// frequently 504s on a query this size (tested: an 80km-radius pull around Nice failed there,
// succeeded on kumi.systems in ~70s) — so that one is tried first, with de/osm.ch as fallbacks
// rather than failing the whole seed run over one busy mirror.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.osm.ch/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const CACHE_DIR = path.join(__dirname, "..", ".cache");

// Trail-relevant highway values. footway/steps are kept (real trail networks legitimately use
// urban connector segments and stairs on hillside trails) but end up weighted down relative to
// path/track/bridleway by edgeWeight() below — a real 80km-radius pull around Nice shows why
// this matters: the dense urban core alone is >85% footway/steps, while the full radius
// (including the Mercantour hinterland) is dominated by path/track once weighted correctly.
//
// secondary/tertiary/unclassified are included too, despite not being "trail" — measured on
// the real dataset: with only path/track/footway/bridleway/steps, the network is badly
// fragmented (largest connected component covers under 10% of nodes, ~19k separate islands),
// because real trail segments in OSM very often only connect to each other via a stretch of
// ordinary road (a trailhead car park reached by a village road, a col crossed by a route
// départementale). residential/service/living_street are deliberately excluded — those are
// dense urban local-street grids, not plausible trail connectors, and would reintroduce the
// same city-center bloat problem footway/steps already cause.
const TRAIL_HIGHWAY_VALUES = [
  "path",
  "track",
  "footway",
  "bridleway",
  "steps",
  "secondary",
  "tertiary",
  "unclassified",
];

export type OsmNodeId = number;

export type WayMeta = {
  highway: string;
  surface?: string;
  sacScale?: string;
  trailVisibility?: string;
};

export type OsmEdge = {
  to: OsmNodeId;
  distanceMeters: number;
  wayIndex: number;
};

export type OsmNetworkGraph = {
  nodes: Map<OsmNodeId, { lat: number; lng: number }>;
  adjacency: Map<OsmNodeId, OsmEdge[]>;
  ways: WayMeta[];
};

type OverpassElement = {
  type: string;
  id: number;
  nodes?: number[];
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
};

type OverpassResponse = { elements: OverpassElement[] };

function overpassQuery(centerLat: number, centerLon: number, radiusKm: number): string {
  const highwayFilter = TRAIL_HIGHWAY_VALUES.join("|");
  return `[out:json][timeout:300];(way(around:${Math.round(radiusKm * 1000)},${centerLat},${centerLon})["highway"~"^(${highwayFilter})$"];);out geom;`;
}

async function fetchFromMirrors(query: string): Promise<OverpassResponse> {
  let lastError: unknown;

  for (const mirror of OVERPASS_MIRRORS) {
    try {
      console.log(`OSM network: querying ${mirror}...`);
      const res = await fetch(mirror, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          // Some Overpass mirrors reject requests with no recognizable User-Agent (406).
          "User-Agent": "xtrail-seed-generator/1.0 (dev tool, not production traffic)",
        },
        body: new URLSearchParams({ data: query }),
      });
      if (!res.ok) {
        lastError = new Error(`${mirror} responded with HTTP ${res.status}`);
        console.warn(String(lastError));
        continue;
      }
      return await res.json();
    } catch (err) {
      lastError = err;
      console.warn(`OSM network: ${mirror} failed — ${err instanceof Error ? err.message : err}`);
    }
  }

  throw new Error(`All Overpass mirrors failed. Last error: ${lastError instanceof Error ? lastError.message : lastError}`);
}

function buildGraph(response: OverpassResponse): OsmNetworkGraph {
  const nodes = new Map<OsmNodeId, { lat: number; lng: number }>();
  const adjacency = new Map<OsmNodeId, OsmEdge[]>();
  const ways: WayMeta[] = [];

  function addEdge(from: OsmNodeId, to: OsmNodeId, distanceMeters: number, wayIndex: number) {
    if (!adjacency.has(from)) adjacency.set(from, []);
    adjacency.get(from)!.push({ to, distanceMeters, wayIndex });
  }

  for (const el of response.elements) {
    if (el.type !== "way" || !el.nodes || !el.geometry || el.nodes.length !== el.geometry.length) continue;
    // Overpass returns a null geometry entry for a node it couldn't resolve (e.g. a way
    // referencing a node outside the query's data set) — skip the whole way rather than
    // building a graph with a broken edge through a missing coordinate.
    if (el.geometry.some((g) => g === null)) continue;

    const wayIndex = ways.length;
    ways.push({
      highway: el.tags?.highway ?? "path",
      surface: el.tags?.surface,
      sacScale: el.tags?.sac_scale,
      trailVisibility: el.tags?.trail_visibility,
    });

    for (let i = 0; i < el.nodes.length; i++) {
      const id = el.nodes[i];
      if (!nodes.has(id)) {
        nodes.set(id, { lat: el.geometry[i].lat, lng: el.geometry[i].lon });
      }
    }

    // Real trails are walkable both directions — every edge is added both ways rather than
    // treating OSM's way direction as a one-way restriction (irrelevant for foot traffic).
    for (let i = 0; i < el.nodes.length - 1; i++) {
      const a = el.nodes[i];
      const b = el.nodes[i + 1];
      const pa = nodes.get(a)!;
      const pb = nodes.get(b)!;
      const distanceMeters = haversineMeters(pa.lat, pa.lng, pb.lat, pb.lng);
      addEdge(a, b, distanceMeters, wayIndex);
      addEdge(b, a, distanceMeters, wayIndex);
    }
  }

  return { nodes, adjacency, ways };
}

// Included in the cache filename so changing TRAIL_HIGHWAY_VALUES automatically invalidates
// stale caches built from a different highway filter, instead of silently reusing them.
const HIGHWAY_FILTER_VERSION = TRAIL_HIGHWAY_VALUES.slice().sort().join(",");

function cacheFilePath(centerLat: number, centerLon: number, radiusKm: number): string {
  const filterHash = Buffer.from(HIGHWAY_FILTER_VERSION).toString("base64url").slice(0, 8);
  return path.join(CACHE_DIR, `osm-network-${centerLat}-${centerLon}-${radiusKm}km-${filterHash}.json`);
}

function serializeGraph(graph: OsmNetworkGraph): string {
  return JSON.stringify({
    nodes: Array.from(graph.nodes, ([id, p]) => [id, p.lat, p.lng]),
    ways: graph.ways.map((w) => [w.highway, w.surface ?? null, w.sacScale ?? null, w.trailVisibility ?? null]),
    adjacency: Array.from(graph.adjacency, ([from, edges]) => [
      from,
      edges.map((e) => [e.to, e.distanceMeters, e.wayIndex]),
    ]),
  });
}

function deserializeGraph(json: string): OsmNetworkGraph {
  const raw = JSON.parse(json) as {
    nodes: [number, number, number][];
    ways: [string, string | null, string | null, string | null][];
    adjacency: [number, [number, number, number][]][];
  };

  return {
    nodes: new Map(raw.nodes.map(([id, lat, lng]) => [id, { lat, lng }])),
    ways: raw.ways.map(([highway, surface, sacScale, trailVisibility]) => ({
      highway,
      surface: surface ?? undefined,
      sacScale: sacScale ?? undefined,
      trailVisibility: trailVisibility ?? undefined,
    })),
    adjacency: new Map(raw.adjacency.map(([from, edges]) => [from, edges.map(([to, d, w]) => ({ to, distanceMeters: d, wayIndex: w }))])),
  };
}

/**
 * Loads the trail-relevant OSM path network within `radiusKm` of (centerLat, centerLon),
 * caching the built graph to disk (prisma/seed/.cache/, gitignored) so repeat seed runs never
 * re-hit Overpass. First run for a given center/radius fetches from a public Overpass mirror
 * (real network call, can take over a minute for an 80km radius — see OVERPASS_MIRRORS) and
 * parses it into a routable graph; every run after that just reads the cache file.
 */
export async function loadOrBuildOsmNetwork(
  centerLat: number,
  centerLon: number,
  radiusKm: number
): Promise<OsmNetworkGraph> {
  const cachePath = cacheFilePath(centerLat, centerLon, radiusKm);

  if (existsSync(cachePath)) {
    console.log(`OSM network: loading cached graph from ${cachePath}`);
    return deserializeGraph(readFileSync(cachePath, "utf8"));
  }

  console.log(`OSM network: no cache found, fetching from Overpass (radius ${radiusKm}km around ${centerLat},${centerLon})...`);
  const response = await fetchFromMirrors(overpassQuery(centerLat, centerLon, radiusKm));
  const graph = buildGraph(response);
  console.log(`OSM network: built graph with ${graph.nodes.size} nodes, ${graph.ways.length} ways`);

  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(cachePath, serializeGraph(graph));
  console.log(`OSM network: cached graph to ${cachePath}`);

  return graph;
}
