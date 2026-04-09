import type { APIRoute } from 'astro';
import { runMissionRedispatch } from '../../lib/redispatch-mission-task';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Relance une mission (évite tout conflit de route avec POST /api/agent-tasks qui crée une tâche).
 * Corps : { taskId: number, sessionKey: string }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return json({ error: 'Non authentifié' }, 401);
  }

  let body: { taskId?: unknown; sessionKey?: string };
  try {
    body = (await request.json()) as { taskId?: unknown; sessionKey?: string };
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const taskId = Number(body.taskId);
  const sessionKey = String(body.sessionKey || '').trim();

  if (!Number.isFinite(taskId) || taskId < 1) {
    return json({ error: 'taskId numérique requis' }, 400);
  }
  if (!sessionKey) {
    return json({ error: 'sessionKey requis' }, 400);
  }

  const result = await runMissionRedispatch({
    taskId,
    sessionKey,
    email: locals.user.email as string | undefined,
  });

  if (!result.ok) {
    return json(
      {
        error: result.error,
        detail: result.detail,
        hint: result.hint,
      },
      502,
    );
  }

  return json({
    ok: true,
    message: 'Directive de relance acceptée (traitement asynchrone ou synchrone selon le gateway).',
    task: result.task,
  });
};
