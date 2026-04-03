import type { APIRoute } from 'astro';
import { db, AgentInstruction } from 'astro:db';
import { eq } from 'drizzle-orm';
import {
  FORGE_AGENT_INSTRUCTION_ROWS,
  readInstructionMdFromRepo,
} from '../../lib/agent-instruction-defaults';

/** Si la table est vide (DB migrée sans seed), on remplit depuis les .md du repo. */
async function ensureAgentInstructionsFromDisk() {
  const existing = await db.select().from(AgentInstruction);
  if (existing.length > 0) return;
  const rows = FORGE_AGENT_INSTRUCTION_ROWS.map((a) => ({
    agentId: a.agentId,
    model: a.model,
    filePath: a.filePath,
    systemPrompt: readInstructionMdFromRepo(a.filePath),
    enabled: 1,
    updatedAt: new Date(),
  }));
  await db.insert(AgentInstruction).values(rows);
}

/** GET  /api/agent-instructions         → liste tous les agents
 *  GET  /api/agent-instructions?id=X    → un agent spécifique
 *  PUT  /api/agent-instructions         → met à jour systemPrompt et/ou model
 */

export const GET: APIRoute = async ({ url }) => {
  try {
    await ensureAgentInstructionsFromDisk();
  } catch {
    /* table absente ou lecture disque impossible */
  }

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
