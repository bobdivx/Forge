import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import { ensureBuiltinToolsSeeded } from '../../lib/forge-tool-catalog';

/**
 * GET    /api/agent-tools           → liste tous les outils du catalogue
 * GET    /api/agent-tools?id=12     → un outil
 * POST   /api/agent-tools           → crée un outil custom
 * PUT    /api/agent-tools           → modifie un outil (toggle enabled, edit cmd…)
 * DELETE /api/agent-tools?id=12     → supprime (interdit si builtin=1)
 */

function serializeTool(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    category: row.category,
    parametersJson: row.parametersJson,
    implementationKind: row.implementationKind,
    implementationConfig: row.implementationConfig,
    enabled: Number(row.enabled) === 1,
    builtin: Number(row.builtin) === 1,
    requiresApproval: Number(row.requiresApproval) === 1,
    createdByAgentId: row.createdByAgentId || null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export const GET: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.email) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  await ensureBuiltinToolsSeeded();
  const { db, AgentTool } = await loadAstroDb();
  const idParam = url.searchParams.get('id');
  if (idParam) {
    const id = Number(idParam);
    const rows = await db.select().from(AgentTool).where(eq(AgentTool.id, id));
    if (!rows.length) return new Response(JSON.stringify({ error: 'Outil introuvable' }), { status: 404 });
    return new Response(JSON.stringify({ tool: serializeTool(rows[0]) }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const rows = await db.select().from(AgentTool);
  return new Response(JSON.stringify({ tools: rows.map(serializeTool) }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const name = String(body.name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
  if (!name) return new Response(JSON.stringify({ error: 'name requis' }), { status: 400 });
  const displayName = String(body.displayName || name).trim();
  const description = String(body.description || '').trim() || `Outil ${name}`;
  const category = String(body.category || 'custom').trim();
  const implementationKind = ['builtin', 'exec_template', 'http'].includes(String(body.implementationKind))
    ? String(body.implementationKind)
    : 'exec_template';
  let parametersJson = '{"type":"object","properties":{}}';
  try {
    if (body.parametersJson) parametersJson = JSON.stringify(JSON.parse(String(body.parametersJson)));
    else if (body.parameters) parametersJson = JSON.stringify(body.parameters);
  } catch {
    return new Response(JSON.stringify({ error: 'parametersJson invalide' }), { status: 400 });
  }
  let implementationConfig = '{}';
  try {
    if (body.implementationConfig) implementationConfig = JSON.stringify(JSON.parse(String(body.implementationConfig)));
    else if (body.command) implementationConfig = JSON.stringify({ command: String(body.command), timeoutMs: 30000 });
  } catch {
    return new Response(JSON.stringify({ error: 'implementationConfig invalide' }), { status: 400 });
  }
  const requiresApproval = body.requiresApproval ? 1 : 0;
  const { db, AgentTool } = await loadAstroDb();
  const existing = await db.select().from(AgentTool).where(eq(AgentTool.name, name));
  if (existing.length) {
    return new Response(JSON.stringify({ error: `Outil "${name}" existe déjà` }), { status: 409 });
  }
  const now = new Date();
  const inserted = await db
    .insert(AgentTool)
    .values({
      name,
      displayName,
      description,
      category,
      parametersJson,
      implementationKind,
      implementationConfig,
      enabled: 1,
      builtin: 0,
      requiresApproval,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  return new Response(JSON.stringify({ ok: true, tool: serializeTool(inserted[0]) }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const id = Number(body.id);
  if (!Number.isFinite(id)) return new Response(JSON.stringify({ error: 'id requis' }), { status: 400 });
  const { db, AgentTool } = await loadAstroDb();
  const existing = await db.select().from(AgentTool).where(eq(AgentTool.id, id));
  if (!existing.length) return new Response(JSON.stringify({ error: 'Outil introuvable' }), { status: 404 });
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof body.displayName === 'string') update.displayName = body.displayName;
  if (typeof body.description === 'string') update.description = body.description;
  if (typeof body.category === 'string') update.category = body.category;
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled ? 1 : 0;
  if (typeof body.requiresApproval === 'boolean') update.requiresApproval = body.requiresApproval ? 1 : 0;
  if (body.parametersJson) {
    try {
      update.parametersJson = JSON.stringify(JSON.parse(String(body.parametersJson)));
    } catch {
      return new Response(JSON.stringify({ error: 'parametersJson invalide' }), { status: 400 });
    }
  }
  if (body.implementationConfig) {
    try {
      update.implementationConfig = JSON.stringify(JSON.parse(String(body.implementationConfig)));
    } catch {
      return new Response(JSON.stringify({ error: 'implementationConfig invalide' }), { status: 400 });
    }
  }
  // ACCÈS TOTAL : aucun champ n'est verrouillé, même pour les builtin.
  // Conséquence : un agent peut réécrire la commande shell de read_file, exec, etc.
  // Le seeder (`ensureBuiltinToolsSeeded`) ne ré-écrasera PAS la modification
  // (cf. logique « ne pas écraser implementationConfig si déjà présent »).
  // En cas de modification fautive, l'utilisateur peut appeler
  // POST /api/agent-tools/reset?id=X pour restaurer la définition de code.
  await db.update(AgentTool).set(update).where(eq(AgentTool.id, id));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};

export const DELETE: APIRoute = async ({ url, locals }) => {
  if (!locals.user?.email) return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  const id = Number(url.searchParams.get('id'));
  if (!Number.isFinite(id)) return new Response(JSON.stringify({ error: 'id requis' }), { status: 400 });
  const { db, AgentTool, AgentToolAssignment } = await loadAstroDb();
  const existing = await db.select().from(AgentTool).where(eq(AgentTool.id, id));
  if (!existing.length) return new Response(JSON.stringify({ error: 'Outil introuvable' }), { status: 404 });
  if (Number(existing[0].builtin) === 1) {
    return new Response(JSON.stringify({ error: 'Outil builtin non supprimable (vous pouvez le désactiver)' }), {
      status: 403,
    });
  }
  await db.delete(AgentToolAssignment).where(eq(AgentToolAssignment.toolId, id));
  await db.delete(AgentTool).where(eq(AgentTool.id, id));
  return new Response(JSON.stringify({ ok: true }), { headers: { 'Content-Type': 'application/json' } });
};
