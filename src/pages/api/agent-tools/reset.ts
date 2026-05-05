import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { loadAstroDb } from '../../../lib/load-astro-db';
import { BUILTIN_TOOLS } from '../../../lib/forge-tool-catalog';

/**
 * POST /api/agent-tools/reset?id=12
 * POST /api/agent-tools/reset?name=read_file
 *
 * Restaure la définition de code d'un outil builtin (utile après une édition
 * fautive par un agent en mode ACCÈS TOTAL). Refuse si l'outil n'est pas builtin.
 *
 * Body optionnel: { resetAssignments: boolean } pour aussi ré-assigner à tous
 * les agents (équivalent d'un seed forcé pour cet outil).
 */
export const POST: APIRoute = async ({ url, request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  const idParam = url.searchParams.get('id');
  const nameParam = url.searchParams.get('name')?.trim();
  if (!idParam && !nameParam) {
    return new Response(JSON.stringify({ error: 'id ou name requis' }), { status: 400 });
  }

  const { db, AgentTool, AgentToolAssignment, AgentInstruction } = await loadAstroDb();

  let row: typeof AgentTool.$inferSelect | undefined;
  if (idParam) {
    const id = Number(idParam);
    if (!Number.isFinite(id)) {
      return new Response(JSON.stringify({ error: 'id invalide' }), { status: 400 });
    }
    const rows = await db.select().from(AgentTool).where(eq(AgentTool.id, id));
    row = rows[0];
  } else {
    const rows = await db.select().from(AgentTool).where(eq(AgentTool.name, String(nameParam)));
    row = rows[0];
  }

  if (!row) {
    return new Response(JSON.stringify({ error: 'Outil introuvable' }), { status: 404 });
  }
  if (Number(row.builtin) !== 1) {
    return new Response(
      JSON.stringify({ error: 'Reset disponible uniquement pour les outils builtin' }),
      { status: 400 },
    );
  }

  const def = BUILTIN_TOOLS.find((t) => t.name === row!.name);
  if (!def) {
    return new Response(
      JSON.stringify({ error: `Définition de code introuvable pour "${row.name}"` }),
      { status: 404 },
    );
  }

  const now = new Date();
  await db
    .update(AgentTool)
    .set({
      displayName: def.displayName,
      description: def.description,
      category: def.category,
      parametersJson: JSON.stringify(def.parameters),
      implementationKind: def.implementationKind,
      implementationConfig: JSON.stringify(def.implementationConfig),
      enabled: 1,
      builtin: 1,
      requiresApproval: def.requiresApproval ? 1 : 0,
      updatedAt: now,
      createdAt: now,
    })
    .where(eq(AgentTool.id, row.id));

  let reassigned = 0;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (body.resetAssignments === true) {
      const agents = await db.select().from(AgentInstruction);
      for (const agent of agents) {
        const existing = await db
          .select()
          .from(AgentToolAssignment)
          .where(eq(AgentToolAssignment.agentId, agent.agentId));
        const has = existing.find((a) => a.toolId === row!.id);
        if (!has) {
          await db.insert(AgentToolAssignment).values({
            agentId: agent.agentId,
            toolId: row.id,
            enabled: 1,
            source: 'default',
            createdAt: now,
          });
          reassigned++;
        } else if (Number(has.enabled) !== 1) {
          await db
            .update(AgentToolAssignment)
            .set({ enabled: 1 })
            .where(eq(AgentToolAssignment.id, has.id));
          reassigned++;
        }
      }
    }
  } catch {
    /* body invalide, ignore */
  }

  return new Response(
    JSON.stringify({ ok: true, name: row.name, id: row.id, reassigned }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
