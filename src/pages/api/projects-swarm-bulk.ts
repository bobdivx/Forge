import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import { eq } from 'drizzle-orm';

/** POST — active ou désactive le swarm sur tous les projets. Corps : { swarmEnabled: boolean } */
export const POST: APIRoute = async ({ request }) => {
  let body: { swarmEnabled?: boolean };
  try {
    body = (await request.json()) as { swarmEnabled?: boolean };
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400 });
  }
  const on = Boolean(body.swarmEnabled);
  try {
    const { db, Project } = await loadAstroDb();
    const rows = await db.select().from(Project);
    const now = new Date();
    for (const p of rows) {
      await db
        .update(Project)
        .set({ swarmEnabled: on ? 1 : 0, updatedAt: now })
        .where(eq(Project.id, p.id));
    }
    return new Response(JSON.stringify({ ok: true, updated: rows.length, swarmEnabled: on }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
