import { loadAstroDb } from '../src/lib/load-astro-db';

async function main() {
  const { db, ForgeSetting } = await loadAstroDb();
  const settings = await db.select().from(ForgeSetting);
  console.log(JSON.stringify(settings, null, 2));
}

main().catch(console.error);
