import { NextRequest, NextResponse } from "next/server";
import { getTerritoriesInBounds } from "@/services/territory";
import { territoryFillFeatures, territoryBorderFeatures } from "@/lib/h3";

// ~831 bytes/territory measured on the real dataset (93MB / 112k territories) — 6000 keeps a
// single response in the low single-digit megabytes regardless of how dense the viewport is.
const MAX_TERRITORIES_PER_REQUEST = 6000;

/**
 * Viewport-scoped territory data for the map (see components/TerritoryMap.tsx) — the client
 * calls this on load and on every pan/zoom with the current visible bounds, instead of the map
 * page loading every territory in the database up front. All H3 geometry computation still
 * happens here, server-side, per the map architecture rules; the client only ever receives
 * ready-to-render GeoJSON.
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const minLat = Number(params.get("minLat"));
  const maxLat = Number(params.get("maxLat"));
  const minLng = Number(params.get("minLng"));
  const maxLng = Number(params.get("maxLng"));

  if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) {
    return NextResponse.json({ error: "Invalid bounds" }, { status: 400 });
  }

  const territories = await getTerritoriesInBounds({ minLat, maxLat, minLng, maxLng }, MAX_TERRITORIES_PER_REQUEST);

  return NextResponse.json({
    fill: territoryFillFeatures(territories),
    borders: territoryBorderFeatures(territories),
    truncated: territories.length >= MAX_TERRITORIES_PER_REQUEST,
  });
}
