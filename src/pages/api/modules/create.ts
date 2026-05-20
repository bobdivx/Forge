import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../../lib/load-astro-db';

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  try {
    const body = await request.json();
    const { identifier, name, description, version, payload, published, isMcp, mcpUrl } = body;

    if (!identifier || !name) {
      return new Response(JSON.stringify({ error: 'identifier et name sont requis' }), { status: 400 });
    }

    const { db, ForgeModule } = await loadAstroDb();

    const now = new Date();
    const result = await db.insert(ForgeModule).values({
      identifier: identifier.trim(),
      name: name.trim(),
      description: description?.trim() || '',
      version: version?.trim() || '1.0.0',
      payload: payload || '{}',
      installed: 0,
      published: published === true || published === 1 ? 1 : 0,
      isMcp: isMcp === true || isMcp === 1 ? 1 : 0,
      mcpUrl: mcpUrl?.trim() || null,
      createdAt: now,
      updatedAt: now,
    }).returning();

    return new Response(JSON.stringify({ ok: true, module: result[0] }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[API Modules] CREATE error:', error);
    return new Response(JSON.stringify({ error: 'Erreur lors de la création du module (l\'identifiant existe peut-être déjà)' }), { status: 500 });
  }
};
