import { db, Config } from 'astro:db';

const all = await db.select().from(Config);
for (const c of all) {
  console.log(`${c.key}: ${c.value}`);
}
