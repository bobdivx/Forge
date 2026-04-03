import type { APIRoute } from 'astro';
import { db, AgentInstruction } from 'astro:db';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { getForgeRepoRoot } from '../../lib/forge-repo-root';

/**
 * POST /api/sync-agents
 * Lit tous les AgentInstruction actifs dans la DB et régénère les fichiers .md
 * correspondants sur le disque, pour qu'OpenClaw puisse les relire.
 *
 * Body optionnel : { agentId: "DEV_FRONTEND" }  → sync un seul agent
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const targetAgent: string | undefined = body?.agentId;

  const repoRoot = getForgeRepoRoot();

  let query = db.select().from(AgentInstruction);
  const rows = await query;

  const toSync = targetAgent
    ? rows.filter(r => r.agentId === targetAgent)
    : rows.filter(r => r.enabled === 1);

  if (!toSync.length) {
    return new Response(JSON.stringify({ ok: false, error: 'Aucun agent trouvé' }), { status: 404 });
  }

  const synced: string[] = [];
  const errors: { agentId: string; error: string }[] = [];

  for (const agent of toSync) {
    try {
      const fullPath = resolve(repoRoot, agent.filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, agent.systemPrompt, 'utf-8');
      synced.push(agent.agentId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ agentId: agent.agentId, error: message });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, synced, errors, total: toSync.length }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};

/** GET /api/sync-agents → statut (liste les agents et si leur fichier existe) */
export const GET: APIRoute = async () => {
  const { existsSync } = await import('node:fs');
  const repoRoot = getForgeRepoRoot();
  const rows = await db.select().from(AgentInstruction);

  const status = rows.map(agent => ({
    agentId:   agent.agentId,
    model:     agent.model,
    filePath:  agent.filePath,
    enabled:   agent.enabled === 1,
    fileExists: existsSync(resolve(repoRoot, agent.filePath)),
    updatedAt: agent.updatedAt,
  }));

  return new Response(JSON.stringify(status), {
    headers: { 'Content-Type': 'application/json' },
  });
};
