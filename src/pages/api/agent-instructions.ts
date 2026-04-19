import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';

/** GET  /api/agent-instructions         → liste tous les agents
 *  GET  /api/agent-instructions?id=X    → un agent spécifique
 *  PUT  /api/agent-instructions         → met à jour systemPrompt et/ou model
 */

export const GET: APIRoute = async ({ url }) => {
  const { db, AgentInstruction } = await loadAstroDb();
  const agentId = url.searchParams.get('id');

  if (agentId) {
    const rows = await db.select().from(AgentInstruction).where(eq(AgentInstruction.agentId, agentId));
    if (!rows.length) return new Response(JSON.stringify({ error: 'Agent not found' }), { status: 404 });
    return new Response(JSON.stringify(rows[0]), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rows = await db.select().from(AgentInstruction);
  return new Response(JSON.stringify(rows), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request }) => {
  const { db, AgentInstruction } = await loadAstroDb();
  const body = await request.json().catch(() => null);
  if (!body?.agentId) {
    return new Response(JSON.stringify({ error: 'agentId requis' }), { status: 400 });
  }

  const { agentId, systemPrompt, model, enabled } = body;

  const updateData: Record<string, unknown> = { updatedAt: new Date() };
  if (systemPrompt !== undefined) updateData.systemPrompt = systemPrompt;
  if (model       !== undefined) updateData.model        = model;
  if (enabled     !== undefined) updateData.enabled      = enabled ? 1 : 0;

  await db.update(AgentInstruction)
    .set(updateData)
    .where(eq(AgentInstruction.agentId, agentId));

  return new Response(JSON.stringify({ ok: true, agentId }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
