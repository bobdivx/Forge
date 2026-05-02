import type { APIRoute } from 'astro';
import { asc } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';

/** Liste des applications / dépôts (table Project) pour l’UI authentifiée. */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { db, Project } = await loadAstroDb();
    const rows = await db.select().from(Project).orderBy(asc(Project.name));
    const projects = rows.map((p) => ({
      id: p.id,
      name: p.name,
      path: p.path,
      swarmEnabled: p.swarmEnabled,
    }));
    return new Response(JSON.stringify({ projects }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : 'Erreur base' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
