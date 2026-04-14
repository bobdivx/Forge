import type { APIRoute } from 'astro';
import { fetchOpenClawAgentsList, fetchOpenClawModelCatalog } from '../../lib/openclaw-gateway';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const email = locals.user?.email as string | undefined;
    
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
    const allModels = [...agentModels, ...catalogModels];
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
