import type { APIRoute } from 'astro';
import { runProjectWorkBurst, startScheduler } from '../../lib/forge-work-scheduler';

/**
 * POST — lance un cycle de travail **ciblé sur un seul projet** (directive Forge + dispatch des tâches).
 * Body : { projectId: number }
 */
export const POST: APIRoute = async ({ request }) => {
  let body: { projectId?: number };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const projectId = Number(body.projectId);
  if (!Number.isFinite(projectId) || projectId < 1) {
    return new Response(JSON.stringify({ error: 'projectId invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    startScheduler();
    const result = await runProjectWorkBurst(projectId);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
