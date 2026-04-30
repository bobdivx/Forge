import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import {
  FORGE_AGENT_INSTRUCTION_ROWS,
  getInitialSystemPrompt,
} from '../../lib/agent-instruction-defaults';
import { SWARM_WORK_PROTOCOL_SUMMARY } from '../../lib/forge-agent-protocol';
import { provisionAgentInZimaOS } from '../../lib/zimaos-agent-provision';

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

  let rows = await db.select().from(AgentInstruction);
  if (rows.length === 0) {
    const now = new Date();
    await db.insert(AgentInstruction).values(
      FORGE_AGENT_INSTRUCTION_ROWS.map((r) => ({
        agentId: r.agentId,
        model: r.model,
        filePath: `db://${r.agentId}`,
        systemPrompt: getInitialSystemPrompt(r.agentId),
        enabled: 1,
        updatedAt: now,
      })),
    );
    rows = await db.select().from(AgentInstruction);
  }
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

export const POST: APIRoute = async ({ request }) => {
  const { db, AgentInstruction } = await loadAstroDb();
  const body = await request.json().catch(() => null);
  const agentId = String(body?.agentId ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, '_');
  const model = String(body?.model ?? '').trim();
  const enabled = body?.enabled === undefined ? 1 : body.enabled ? 1 : 0;
  const customPath = String(body?.filePath ?? '').trim();
  const systemPrompt = String(body?.systemPrompt ?? '').trim();

  if (!agentId || agentId.length < 2) {
    return new Response(JSON.stringify({ ok: false, error: 'agentId invalide' }), { status: 400 });
  }
  if (!model) {
    return new Response(JSON.stringify({ ok: false, error: 'model requis' }), { status: 400 });
  }

  const existing = await db.select().from(AgentInstruction).where(eq(AgentInstruction.agentId, agentId)).limit(1);
  if (existing.length) {
    return new Response(JSON.stringify({ ok: false, error: `Agent ${agentId} existe déjà` }), { status: 409 });
  }

  const defaultRow = FORGE_AGENT_INSTRUCTION_ROWS.find((r) => r.agentId === agentId);
  const filePath = customPath || defaultRow?.filePath || `doc/agents/${agentId}.md`;
  const prompt =
    systemPrompt ||
    `# ${agentId}\n\nVous êtes l'agent ${agentId}. Répondez de manière concise, structurée et orientée action.\n\n${SWARM_WORK_PROTOCOL_SUMMARY}`;

  await db.insert(AgentInstruction).values({
    agentId,
    model,
    filePath: `db://${agentId}`, // Placeholder path since we use DB now
    systemPrompt: prompt,
    enabled,
    updatedAt: new Date(),
  });

  // Provisioning ZimaOS (Push de la config DB vers le gateway)
  const provision = await provisionAgentInZimaOS({
    agentId,
    model,
    filePath: '', // On passe vide pour signaler le mode DB
    systemPrompt: prompt,
  });

  return new Response(JSON.stringify({ ok: true, agentId, provision }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
