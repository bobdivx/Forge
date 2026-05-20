import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { loadAstroDb } from '../../../lib/load-astro-db';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, installed } = body;

    if (id === undefined || installed === undefined) {
      return new Response(JSON.stringify({ error: 'id et installed sont requis' }), { status: 400 });
    }

    const { db, ForgeModule } = await loadAstroDb();

    // Toggle the installed boolean
    const updated = await db
      .update(ForgeModule)
      .set({
        installed: installed ? 1 : 0,
        updatedAt: new Date(),
      })
      .where(eq(ForgeModule.id, Number(id)))
      .returning();

    if (updated.length === 0) {
      return new Response(JSON.stringify({ error: 'Module introuvable' }), { status: 404 });
    }

    return new Response(JSON.stringify({ ok: true, module: updated[0] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[API Modules] INSTALL error:', error);
    return new Response(JSON.stringify({ error: 'Erreur lors de la modification de l\'état d\'installation' }), { status: 500 });
  }
};
