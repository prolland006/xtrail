import { getTerritories } from "../src/services/territory";
import { territoryFillFeatures, territoryBorderFeatures } from "../src/lib/h3";
import { prisma } from "../src/lib/db";

async function main() {
  const t0 = Date.now();
  const territories = await getTerritories();
  const t1 = Date.now();
  console.log(`DB query (getTerritories): ${t1 - t0}ms, ${territories.length} rows`);

  const fill = territoryFillFeatures(territories);
  const t2 = Date.now();
  console.log(`territoryFillFeatures: ${t2 - t1}ms`);

  const border = territoryBorderFeatures(territories);
  const t3 = Date.now();
  console.log(`territoryBorderFeatures: ${t3 - t2}ms`);

  const payload = JSON.stringify({ fill, border });
  console.log(`Serialized GeoJSON payload size: ${(payload.length / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Total server-side time: ${t3 - t0}ms`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
