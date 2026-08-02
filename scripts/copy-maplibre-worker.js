// MapLibre GL JS resolves its worker script relative to import.meta.url, which Next.js's
// webpack bundling does not rewrite correctly, causing the worker request to be served the
// app's HTML instead of JS (MIME type error). Serving the worker as a static file and pointing
// setWorkerUrl() at it (see ActivityMap.tsx) works around this. Re-copied on every install so it
// stays in sync with the installed maplibre-gl version.
const fs = require("node:fs");
const path = require("node:path");

// The worker script itself imports "./maplibre-gl-shared.mjs" as a sibling file, so both must be
// copied side by side for that relative import to resolve once served as static files.
const distDir = path.join(__dirname, "..", "node_modules", "maplibre-gl", "dist");
const publicDir = path.join(__dirname, "..", "public");

for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  fs.copyFileSync(path.join(distDir, file), path.join(publicDir, file));
}
