import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../../lib/load-astro-db';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  const { db, ForgeModule } = await loadAstroDb();

  try {
    const modules = await db.select().from(ForgeModule);
    return new Response(JSON.stringify({ modules }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[API Modules] GET error:', error);
    return new Response(JSON.stringify({ error: 'Erreur lors de la récupération des modules' }), { status: 500 });
  }
};
