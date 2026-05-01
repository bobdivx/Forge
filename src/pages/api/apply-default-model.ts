import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import { eq } from 'drizzle-orm';
import { getAllConfig } from '../../lib/config-db';

export const POST: APIRoute = async () => {

  try {
    const { db, AgentInstruction } = await loadAstroDb();
    const config = await getAllConfig();
    const defaultModel = config.agentDefaultModel || 'Auto';

    const agents = await db.select().from(AgentInstruction);
    const { provisionAgentInZimaOS } = await import('../../lib/zimaos-agent-provision');

    for (const agent of agents) {
      await db.update(AgentInstruction).set({ 
        model: defaultModel,
        updatedAt: new Date()
      }).where(eq(AgentInstruction.agentId, agent.agentId));

      await provisionAgentInZimaOS({
        agentId: agent.agentId,
        model: defaultModel,
        filePath: '',
        systemPrompt: agent.systemPrompt
      });
    }

    return new Response(JSON.stringify({ ok: true, message: `Tous les agents (${agents.length}) ont été basculés sur : ${defaultModel}` }), { status: 200 });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
