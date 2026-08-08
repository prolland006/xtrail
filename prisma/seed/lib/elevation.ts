import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import type { OsmNodeId } from "./osmNetwork";

// Public, no-key OpenTopoData instance backed by SRTM (~90m resolution) — sufcient precision
// for D+ on trail-length routes, and avoids the account/login now required by most direct
// SRTM tile mirrors (NASA Earthdata, USGS EarthExplorer). Rate-limited by the host to ~1
// request/second and a modest batch size — both respected below. Every node's elevation is
// cached to disk by OSM node id (prisma/seed/.cache/), so it's only ever fetched once across
// every seed run, no matter how many routes reuse that node.
const OPENTOPODATA_URL = "https://api.opentopodata.org/v1/srtm90m";
const BATCH_SIZE = 100;
const REQUEST_INTERVAL_MS = 1500; // comfortably over the host's 1 req/s limit
const MAX_RETRIES = 3;

const CACHE_DIR = path.join(__dirname, "..", ".cache");
const CACHE_FILE = path.join(CACHE_DIR, "elevation-srtm90m.json");

function loadCache(): Map<OsmNodeId, number> {
  if (!existsSync(CACHE_FILE)) return new Map();
  const raw = JSON.parse(readFileSync(CACHE_FILE, "utf8")) as [OsmNodeId, number][];
  return new Map(raw);
}

function saveCache(cache: Map<OsmNodeId, number>): void {
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, JSON.stringify(Array.from(cache)));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resolves elevation (meters) for a set of (nodeId, lat, lng) points, using the on-disk cache
 * first and only hitting the network for ids never looked up before. The returned map may be
 * missing an id if OpenTopoData itself has no data there (returns elevation: null — genuine
 * data void) or if every retry for its batch failed — callers (see routeElevation.ts) are
 * expected to fill either case from a neighboring point rather than assume sea level.
 */
export async function getElevations(
  points: { id: OsmNodeId; lat: number; lng: number }[]
): Promise<Map<OsmNodeId, number | null>> {
  const cache = loadCache();
  const result = new Map<OsmNodeId, number | null>();
  const uncached = points.filter((p) => {
    const cached = cache.get(p.id);
    if (cached !== undefined) {
      result.set(p.id, cached);
      return false;
    }
    return true;
  });

  if (uncached.length === 0) return result;

  console.log(`Elevation: fetching ${uncached.length} uncached point(s) from OpenTopoData...`);

  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE);
    const locations = batch.map((p) => `${p.lat},${p.lng}`).join("|");

    let succeeded = false;
    for (let attempt = 0; attempt <= MAX_RETRIES && !succeeded; attempt++) {
      if (attempt > 0) await sleep(REQUEST_INTERVAL_MS * 2 * attempt); // back off harder on retry

      try {
        const res = await fetch(`${OPENTOPODATA_URL}?locations=${locations}`);
        if (res.status === 429) throw new Error("HTTP 429 (rate limited)");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { results: { elevation: number | null }[] };

        batch.forEach((p, idx) => {
          const elevation = data.results[idx]?.elevation ?? null;
          result.set(p.id, elevation);
          if (elevation !== null) cache.set(p.id, elevation);
        });
        succeeded = true;
      } catch (err) {
        console.warn(
          `Elevation: batch starting at index ${i} failed (attempt ${attempt + 1}/${MAX_RETRIES + 1}) — ${err instanceof Error ? err.message : err}`
        );
      }
    }

    if (!succeeded) {
      // Leaves these ids unresolved (not set to null) rather than caching a bogus value —
      // routeElevation.ts fills gaps from a neighboring valid sample instead of assuming 0.
      batch.forEach((p) => result.delete(p.id));
    }

    if (i + BATCH_SIZE < uncached.length) await sleep(REQUEST_INTERVAL_MS);
  }

  saveCache(cache);
  console.log(`Elevation: cache now holds ${cache.size} point(s)`);

  return result;
}
