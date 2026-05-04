import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import type { AgentTaskTerminalStatus } from '../../lib/forge-task-status-sync';
import { finalizeAgentTaskStatus } from '../../lib/forge-task-status-sync';
import { insertForgeActivityLog } from '../../lib/forge-activity-log';

/** POST { agentId, task, status? } — crée une tâche en base. */
export const POST: APIRoute = async ({ request }) => {
  const { db, AgentTask, Project } = await loadAstroDb();
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { agentId, task, input, status = 'pending', projectId: rawProjectId } = body ?? {};
  if (!agentId || !task) {
    return new Response(
      JSON.stringify({ error: 'agentId et task sont requis' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  let projectId: number | undefined;
  if (rawProjectId !== undefined && rawProjectId !== null && rawProjectId !== '') {
    const pid = Number(rawProjectId);
    if (!Number.isFinite(pid) || pid < 1) {
      return new Response(JSON.stringify({ error: 'projectId invalide' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const [p] = await db.select().from(Project).where(eq(Project.id, pid)).limit(1);
    if (!p) {
      return new Response(JSON.stringify({ error: 'Projet / application introuvable' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    projectId = pid;
  }

  try {
    const now = new Date();
    const [inserted] = await db
      .insert(AgentTask)
      .values({
        agentId: String(agentId),
        task: String(task),
        input: input != null ? String(input) : undefined,
        status: String(status),
        projectId,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return new Response(JSON.stringify({ ok: true, task: inserted }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

type TaskRow = {
  id: number | string;
  agentId: string;
  task: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  source: 'db';
};

export const GET: APIRoute = async () => {
  const { db, AgentTask, desc } = await loadAstroDb();

  let dbTasks: TaskRow[] = [];
  try {
    const rows = await db.select().from(AgentTask).orderBy(desc(AgentTask.createdAt)).limit(50);
    dbTasks = rows.map((t) => ({
      id: t.id,
      agentId: t.agentId,
      task: t.task,
      status: t.status,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
      updatedAt: t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt),
      source: 'db',
    }));
  } catch {
    /* Astro DB indisponible ou table absente */
  }

  const merged = [...dbTasks];
  merged.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return new Response(
    JSON.stringify({
      tasks: merged,
      dbCount: dbTasks.length,
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};

/**
 * PUT { id, status, output? } — un agent met à jour le statut d'une tâche.
 * Statuts valides : pending | running | completed | failed | bug | cancelled
 */
export const PUT: APIRoute = async ({ request, locals }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { id, status, output } = body ?? {};
  if (!id || !status) {
    return new Response(
      JSON.stringify({ error: 'id et status sont requis' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  const VALID = ['pending', 'running', 'completed', 'failed', 'bug', 'cancelled'];
  if (!VALID.includes(String(status))) {
    return new Response(
      JSON.stringify({ error: `status invalide. Valeurs: ${VALID.join(', ')}` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  try {
    const r = await finalizeAgentTaskStatus(
      Number(id),
      String(status) as AgentTaskTerminalStatus,
      output,
    );
    if (!r.ok) {
      return new Response(JSON.stringify({ error: r.error || 'Mise à jour impossible' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const actorEmail =
      String((locals as { user?: { email?: string } })?.user?.email ?? '').trim() || 'dashboard';
    await insertForgeActivityLog({
      actorType: 'user',
      actorId: actorEmail.slice(0, 200),
      action: 'swarm.task.status_manual',
      entityType: 'agent_task',
      entityId: String(Number(id)),
      details: { status: String(status) },
    });

    return new Response(JSON.stringify({ ok: true, id, status }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
