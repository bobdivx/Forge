import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import { getAllConfig } from '../../lib/config-db';

export const POST: APIRoute = async ({ locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  try {
    const { db, AgentInstruction } = await loadAstroDb();
    const config = await getAllConfig();
    const defaultModel = config.agentDefaultModel || 'Auto';

    await db.update(AgentInstruction).set({ 
      model: defaultModel,
      updatedAt: new Date()
    });

    return new Response(JSON.stringify({ ok: true, message: `Tous les agents ont été basculés sur : ${defaultModel}` }), { status: 200 });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
