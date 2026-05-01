import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import { eq, like, inArray, notInArray } from 'drizzle-orm';
import { getAllConfig } from '../../lib/config-db';

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const { fallbackModel } = body;

  try {
    const { db, Config, AgentInstruction } = await loadAstroDb();
    const config = await getAllConfig();
    const effectiveFallback = fallbackModel || config.agentDefaultModel || 'Auto';

    // 1. Trouver tous les modèles KO
    const compatibilityRows = await db.select().from(Config).where(like(Config.key, 'compatibility_ollama_%'));
    const koModels: string[] = [];
    
    for (const row of compatibilityRows) {
      try {
        const val = JSON.parse(row.value);
        if (val.ok === false) {
          koModels.push(row.key.replace('compatibility_ollama_', ''));
        }
      } catch (e) {}
    }

    if (koModels.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: 'Aucun modèle KO détecté.', updatedCount: 0 }), { status: 200 });
    }

    // 2. Mettre à jour les agents utilisant un modèle KO
    // Note: Drizzle inArray peut être limité si la liste est vide, mais ici on a checké koModels.length > 0
    const agentsToUpdate = await db.select().from(AgentInstruction).where(inArray(AgentInstruction.model, koModels));
    
    for (const agent of agentsToUpdate) {
      await db.update(AgentInstruction)
        .set({ 
          model: effectiveFallback,
          updatedAt: new Date()
        })
        .where(eq(AgentInstruction.agentId, agent.agentId));
    }

    return new Response(JSON.stringify({ 
      ok: true, 
      message: `${agentsToUpdate.length} agents mis à jour vers ${effectiveFallback}.`,
      updatedCount: agentsToUpdate.length,
      koModels
    }), { status: 200 });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
