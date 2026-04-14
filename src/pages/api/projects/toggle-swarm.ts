import { db, Project, eq } from 'astro:db';
import type { APIRoute } from 'astro';

export const POST: APIRoute = async ({ request }) => {
  try {
    const { id, enabled } = await request.json();

    if (id === undefined || enabled === undefined) {
      return new Response(JSON.stringify({ error: 'Champs id et enabled requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    await db
      .update(Project)
      .set({ swarmEnabled: enabled ? 1 : 0, updatedAt: new Date() })
      .where(eq(Project.id, Number(id)));

    return new Response(JSON.stringify({ ok: true, id, swarmEnabled: !!enabled }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
