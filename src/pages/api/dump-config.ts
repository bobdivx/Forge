import type { APIRoute } from 'astro';
import { db, Config } from 'astro:db';

export const GET: APIRoute = async () => {
  const configs = await db.select().from(Config);
  return new Response(JSON.stringify(configs), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
