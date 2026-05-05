import type { APIRoute } from 'astro';
import { eq, and } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import { ensureBuiltinToolsSeeded } from '../../lib/forge-tool-catalog';

/**
 * GET    /api/agent-tool-assignments?agentId=DEV_BACKEND
 *        → liste des outils assignés à l'agent (avec définitions jointes)
 * POST   /api/agent-tool-assignments
 *        body: { agentId, toolId, enabled?: boolean, source?: 'manual' }
 *        Idempotent (toggle si existe déjà).
 * DELETE /api/agent-tool-assignments?agentId=...&toolId=...
 *        → désassigne (suppression dure)
 */

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.email) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  await ensureBuiltinToolsSeeded();
  const agentId = String(url.searchParams.get('agentId') || '').trim();
  if (!agentId) return new Response(JSON.stringify({ error: 'agentId requis' }), { status: 400 });
  const { db, AgentTool, AgentToolAssignment } = await loadAstroDb();
  const assignments = await db.select().from(AgentToolAssignment).where(eq(AgentToolAssignment.agentId, agentId));
  const tools = await db.select().from(AgentTool);
  const byId = new Map(tools.map((t) => [t.id, t]));
  const items = assignments.map((a) => {
    const t = byId.get(a.toolId);
    return {
      assignmentId: a.id,
      toolId: a.toolId,
      enabled: Number(a.enabled) === 1,
      source: a.source,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : String(a.createdAt),
      tool: t
        ? {
            id: t.id,
            name: t.name,
            displayName: t.displayName,
            description: t.description,
            category: t.category,
            implementationKind: t.implementationKind,
            builtin: Number(t.builtin) === 1,
            enabled: Number(t.enabled) === 1,
          }
        : null,
    };
  });
  return new Response(JSON.stringify({ agentId, items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const agentId = String(body.agentId || '').trim();
  const toolId = Number(body.toolId);
  const enabled = body.enabled === false ? 0 : 1;
  const source = String(body.source || 'manual').trim() || 'manual';
  if (!agentId || !Number.isFinite(toolId)) {
    return new Response(JSON.stringify({ error: 'agentId et toolId requis' }), { status: 400 });
  }
  const { db, AgentToolAssignment } = await loadAstroDb();
  const existing = await db
    .select()
    .from(AgentToolAssignment)
    .where(and(eq(AgentToolAssignment.agentId, agentId), eq(AgentToolAssignment.toolId, toolId)));
  if (existing.length) {
    await db.update(AgentToolAssignment).set({ enabled }).where(eq(AgentToolAssignment.id, existing[0].id));
    return new Response(JSON.stringify({ ok: true, updated: true }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  await db
    .insert(AgentToolAssignment)
    .values({ agentId, toolId, enabled, source, createdAt: new Date() });
  return new Response(JSON.stringify({ ok: true, created: true }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.email) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  const agentId = String(url.searchParams.get('agentId') || '').trim();
  const toolId = Number(url.searchParams.get('toolId'));
  if (!agentId || !Number.isFinite(toolId)) {
    return new Response(JSON.stringify({ error: 'agentId et toolId requis' }), { status: 400 });
  }
  const { db, AgentToolAssignment } = await loadAstroDb();
  await db
    .delete(AgentToolAssignment)
    .where(and(eq(AgentToolAssignment.agentId, agentId), eq(AgentToolAssignment.toolId, toolId)));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
