import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../../lib/load-astro-db';
import { runMissionRedispatch } from '../../../lib/redispatch-mission-task';

const VALID_STATUS = ['pending', 'running', 'completed', 'failed', 'bug', 'cancelled'] as const;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function parseId(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? n : null;
}

/** PATCH — mise à jour partielle (titre, consigne, sortie, statut). */
export const PATCH: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user?.email) {
    return json({ error: 'Non authentifié' }, 401);
  }
  const id = parseId(params.id);
  if (id == null) return json({ error: 'id invalide' }, 400);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const task = body.task != null ? String(body.task) : undefined;
  const input = body.input != null ? String(body.input) : undefined;
  const output = body.output != null ? String(body.output) : undefined;
  const status = body.status != null ? String(body.status) : undefined;

  if (status !== undefined && !VALID_STATUS.includes(status as (typeof VALID_STATUS)[number])) {
    return json({ error: `status invalide (${VALID_STATUS.join(', ')})` }, 400);
  }

  if (task === undefined && input === undefined && output === undefined && status === undefined) {
    return json({ error: 'Au moins un champ : task, input, output, status' }, 400);
  }

  const { db, AgentTask, eq } = await loadAstroDb();
  const now = new Date();
  const set: Record<string, unknown> = { updatedAt: now };
  if (task !== undefined) set.task = task.slice(0, 2000);
  if (input !== undefined) set.input = input.slice(0, 120000);
  if (output !== undefined) set.output = output.slice(0, 120000);
  if (status !== undefined) set.status = status;

  try {
    await db.update(AgentTask).set(set as any).where(eq(AgentTask.id, id));
    const [row] = await db.select().from(AgentTask).where(eq(AgentTask.id, id)).limit(1);
    return json({ ok: true, task: row ?? null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur mise à jour';
    return json({ error: msg }, 500);
  }
};

/** DELETE — supprime l'entrée journal. */
export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user?.email) {
    return json({ error: 'Non authentifié' }, 401);
  }
  const id = parseId(params.id);
  if (id == null) return json({ error: 'id invalide' }, 400);

  try {
    const { db, AgentTask, eq } = await loadAstroDb();
    await db.delete(AgentTask).where(eq(AgentTask.id, id));
    return json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur suppression';
    return json({ error: msg }, 500);
  }
};

/**
 * POST — relance (alias de /api/agent-task-redispatch ; préférez ce dernier côté UI).
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user?.email) {
    return json({ error: 'Non authentifié' }, 401);
  }
  const id = parseId(params.id);
  if (id == null) return json({ error: 'id invalide' }, 400);

  let body: { sessionKey?: string };
  try {
    body = (await request.json()) as { sessionKey?: string };
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }
  const sessionKey = String(body.sessionKey || '').trim();
  if (!sessionKey) {
    return json({ error: 'sessionKey requis (session OpenClaw cible)' }, 400);
  }

  const result = await runMissionRedispatch({
    taskId: id,
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
