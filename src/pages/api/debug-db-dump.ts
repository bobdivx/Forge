import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';

export const GET: APIRoute = async () => {
  try {
    const { db, Config } = await loadAstroDb();
    const rows = await db.select().from(Config);
    return new Response(JSON.stringify(rows), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
