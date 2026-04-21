import type { APIRoute } from 'astro';
import { fetchOpenClawAgentsList, fetchOpenClawModelCatalog } from '../../lib/openclaw-gateway';
import { loadAstroDb } from '../../lib/load-astro-db';
import { FORGE_DEFAULT_AGENT_MODELS } from '../../lib/agent-model-defaults';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const email = locals.user?.email as string | undefined;
    const { db, AgentModel, AgentInstruction } = await loadAstroDb();
    const now = new Date();

    // 0. Base locale stable (DB)
    let dbEnabled: { id: string; name: string; ownedBy: string }[] = [];
    try {
      if (AgentModel) {
        let dbCatalog = await db.select().from(AgentModel);
        if (dbCatalog.length === 0) {
          await db.insert(AgentModel).values(
            FORGE_DEFAULT_AGENT_MODELS.map((m) => ({
              id: m.id,
              label: m.label,
              source: 'seed',
              enabled: 1,
              updatedAt: now,
            })),
          );
          dbCatalog = await db.select().from(AgentModel);
        } else {
          const existing = new Set(dbCatalog.map((m) => String(m.id).trim()));
          for (const m of FORGE_DEFAULT_AGENT_MODELS) {
            if (existing.has(m.id)) continue;
            await db.insert(AgentModel).values({
              id: m.id,
              label: m.label,
              source: 'seed',
              enabled: 1,
              updatedAt: now,
            });
          }
          dbCatalog = await db.select().from(AgentModel);
        }
        dbEnabled = dbCatalog
          .filter((m) => Number(m.enabled) === 1)
          .map((m) => ({
            id: `openclaw/${String(m.id).trim()}`,
            name: String(m.label || m.id).trim() || String(m.id).trim(),
            ownedBy: 'forge-db',
          }));
      }
    } catch {
      // Schéma/table potentiellement non migré: on continue sans bloquer l'endpoint.
      dbEnabled = FORGE_DEFAULT_AGENT_MODELS.map((m) => ({
        id: `openclaw/${m.id}`,
        name: m.label,
        ownedBy: 'forge-default',
      }));
    }
    const instructionModelsRaw = await db.select({ model: AgentInstruction.model }).from(AgentInstruction);
    const instructionModels = instructionModelsRaw
      .map((row) => String(row.model || '').trim())
      .filter(Boolean)
      .map((id) => ({ id: `openclaw/${id}`, name: id, ownedBy: 'forge-instruction' }));
    
    // 1. Récupérer les agents (sessions/capabilities)
    const agentsRes = await fetchOpenClawAgentsList(email);
    const agentModels = agentsRes.ok ? agentsRes.agents.map(a => ({
        id: `openclaw/${a.id}`,
        name: a.name || a.id,
        ownedBy: 'openclaw-agent',
    })) : [];

    // 2. Récupérer le catalogue global (Ollama, etc)
    const catalogRes = await fetchOpenClawModelCatalog(email);
    const catalogModels = catalogRes.ok ? catalogRes.models.map(m => ({
        id: `openclaw/${m.id}`,
        name: m.name || m.id,
        ownedBy: m.ownedBy || 'openclaw',
    })) : [];

    // 3. Fusion unique (par ID)
    const allModels = [...dbEnabled, ...instructionModels, ...agentModels, ...catalogModels];
    const uniqueModels = Array.from(new Map(allModels.map(m => [m.id, m])).values());

    return new Response(JSON.stringify(uniqueModels), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
