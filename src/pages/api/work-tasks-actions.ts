import type { APIRoute } from 'astro';
import { desc, inArray, sql } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import {
  dispatchSinglePendingTaskById,
  startScheduler,
  triggerDispatchNow,
} from '../../lib/forge-work-scheduler';
import { insertForgeActivityLog } from '../../lib/forge-activity-log';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const STATUS_PENDING = ['pending', 'bug'] as const;
const STATUS_FINISHED = ['completed', 'failed', 'cancelled'] as const;

/** Liste des AgentTask (base uniquement) pour la page Travail. */
export const GET: APIRoute = async ({ locals, url }) => {
  if (!locals.user?.email) {
    return json({ error: 'Non authentifié' }, 401);
  }
  const rawLimit = Number(url.searchParams.get('limit') || '400');
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(1, rawLimit), 800) : 400;

  try {
    const { db, AgentTask } = await loadAstroDb();
    const rows = await db.select().from(AgentTask).orderBy(desc(AgentTask.createdAt)).limit(limit);
    return json({
      tasks: rows.map((t) => ({
        id: t.id,
        agentId: t.agentId,
        task: t.task,
        input: t.input ?? null,
        output: t.output ?? null,
        status: t.status,
        projectId: t.projectId ?? null,
        createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
        updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
      })),
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Erreur lecture tâches' }, 500);
  }
};

/**
 * POST — actions sur les AgentTask.
 * { action: 'dispatchQueue' } — même effet qu'un tick : file carnet + pending.
 * { action: 'dispatchTask', taskId: number } — envoi d'une tâche précise (pending/bug).
 * { action: 'deleteTasks', scope: 'pending' | 'finished' | 'all' }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return json({ error: 'Non authentifié' }, 401);
  }

  const email = String(locals.user.email).trim().slice(0, 200);

  let body: {
    action?: string;
    taskId?: unknown;
    scope?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json({ error: 'JSON invalide' }, 400);
  }

  const action = String(body.action || '').trim();

  if (action === 'dispatchQueue') {
    try {
      startScheduler();
      await triggerDispatchNow();
      return json({ ok: true, message: 'Dispatch de la file lancé (carnet + tâches en attente).' });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Échec dispatch' }, 500);
    }
  }

  if (action === 'dispatchTask') {
    const taskId = Number(body.taskId);
    if (!Number.isFinite(taskId) || taskId < 1) {
      return json({ error: 'taskId invalide' }, 400);
    }
    startScheduler();
    const r = await dispatchSinglePendingTaskById(taskId, { actorId: email });
    if (!r.ok) {
      return json({ error: r.error || 'Envoi impossible' }, r.error?.includes('introuvable') ? 404 : 400);
    }
    return json({ ok: true, task: r.task });
  }

  if (action === 'deleteTasks') {
    const scope = String(body.scope || '').trim() as 'pending' | 'finished' | 'all';
    if (!['pending', 'finished', 'all'].includes(scope)) {
      return json({ error: 'scope attendu : pending | finished | all' }, 400);
    }

    try {
      const { db, AgentTask } = await loadAstroDb();

      if (scope === 'all') {
        await db.delete(AgentTask).where(sql`1 = 1`);
        await insertForgeActivityLog({
          actorType: 'user',
          actorId: email,
          action: 'swarm.task.bulk_deleted',
          entityType: 'agent_task',
          entityId: 'all',
          details: { scope: 'all' },
        });
        return json({ ok: true, deleted: 'all', message: 'Toutes les entrées AgentTask ont été supprimées.' });
      }

      const statuses = scope === 'pending' ? [...STATUS_PENDING] : [...STATUS_FINISHED];
      const before = await db.select().from(AgentTask).where(inArray(AgentTask.status, statuses));
      const n = before.length;
      if (n === 0) {
        return json({ ok: true, deleted: 0, message: 'Aucune ligne à supprimer pour ce filtre.' });
      }
      await db.delete(AgentTask).where(inArray(AgentTask.status, statuses));
      await insertForgeActivityLog({
        actorType: 'user',
        actorId: email,
        action: 'swarm.task.bulk_deleted',
        entityType: 'agent_task',
        entityId: `scope:${scope}`,
        details: { scope, count: n },
      });
      return json({
        ok: true,
        deleted: n,
        message:
          scope === 'pending'
            ? `${n} tâche(s) en file supprimée(s).`
            : `${n} tâche(s) terminée(s) / annulée(s) supprimée(s).`,
      });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Suppression impossible' }, 500);
    }
  }

  return json({ error: 'action inconnue (dispatchQueue | dispatchTask | deleteTasks)' }, 400);
};
