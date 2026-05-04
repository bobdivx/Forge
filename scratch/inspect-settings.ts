import { loadAstroDb } from '../src/lib/load-astro-db';

async function main() {
  const { db, Config } = await loadAstroDb();
  const settings = await db.select().from(Config);
  console.log(JSON.stringify(settings, null, 2));
}

main().catch(console.error);
