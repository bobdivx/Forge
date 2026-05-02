import type { APIRoute } from 'astro';
import { applyAgentInstructionModel } from '../../lib/apply-agent-instruction-model';
import { listForgeProjectScopedChildAgents } from '../../lib/forge-project-scoped-agents';

/**
 * POST { agentId, model, cascadeToSubagents?: boolean }
 * Applique le modèle aux instructions Forge : agent parent + agents enfants projet (`__APP_`) si demandé.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const agentId = String(body?.agentId ?? '').trim();
  const model = String(body?.model ?? '').trim();
  const cascadeToSubagents = body?.cascadeToSubagents !== false;

  if (!agentId || agentId.length < 2) {
    return new Response(JSON.stringify({ ok: false, error: 'agentId requis' }), { status: 400 });
  }
  if (!model) {
    return new Response(JSON.stringify({ ok: false, error: 'model requis' }), { status: 400 });
  }

  const targets = new Set<string>();
  targets.add(agentId);
  if (cascadeToSubagents) {
    try {
      const subs = await listForgeProjectScopedChildAgents(agentId);
      for (const s of subs) targets.add(s.agentId);
    } catch {
      /* ignore subagent listing failure — au minimum le parent */
    }
  }

  const results: { agentId: string; ok: boolean; error?: string }[] = [];
  for (const id of targets) {
    try {
      await applyAgentInstructionModel(id, model);
      results.push({ agentId: id, ok: true });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ agentId: id, ok: false, error: msg });
    }
  }

  const allOk = results.every((r) => r.ok);
  return new Response(
    JSON.stringify({
      ok: allOk,
      updated: results.filter((r) => r.ok).length,
      results,
    }),
    {
      status: allOk ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
