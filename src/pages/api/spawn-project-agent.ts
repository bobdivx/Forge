// @ts-nocheck
import type { APIRoute } from 'astro';
import { ensureForgeProjectScopedAgent } from '../../lib/forge-project-scoped-agents';

/** POST { parentAgentId, projectId } — provisionne un sous-agent projet (`…__APP_…`). */
export const POST: APIRoute = async ({ request }) => {
  let body: { parentAgentId?: string; projectId?: number };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400 });
  }
  const parentAgentId = String(body.parentAgentId || '').trim();
  const projectId = Number(body.projectId);
  if (!parentAgentId || !Number.isFinite(projectId)) {
    return new Response(JSON.stringify({ error: 'parentAgentId et projectId requis' }), { status: 400 });
  }
  try {
    const r = await ensureForgeProjectScopedAgent({ parentAgentId, projectId });
    return new Response(JSON.stringify({ ok: true, ...r }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), { status: 500 });
  }
};
