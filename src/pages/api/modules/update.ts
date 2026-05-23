import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { loadAstroDb } from '../../../lib/load-astro-db';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, description, version, payload, isMcp, mcpUrl } = body;

    if (id === undefined) {
      return new Response(JSON.stringify({ error: 'id est requis' }), { status: 400 });
    }

    const { db, ForgeModule } = await loadAstroDb();

    const updateData: Record<string, any> = {
      updatedAt: new Date(),
    };

    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description.trim();
    if (version !== undefined) updateData.version = version.trim();
    if (payload !== undefined) updateData.payload = payload.trim();
    if (isMcp !== undefined) updateData.isMcp = isMcp === true || isMcp === 1 ? 1 : 0;
    if (mcpUrl !== undefined) updateData.mcpUrl = mcpUrl ? mcpUrl.trim() : null;

    const updated = await db
      .update(ForgeModule)
      .set(updateData)
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
    console.error('[API Modules] UPDATE error:', error);
    return new Response(JSON.stringify({ error: 'Erreur lors de la mise à jour du module' }), { status: 500 });
  }
};
