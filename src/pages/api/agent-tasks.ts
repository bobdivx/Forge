import type { APIRoute } from 'astro';
import { db, AgentTask, desc, eq } from 'astro:db';
import {
  fetchOpenClawSessionsPayload,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
} from '../../lib/openclaw-gateway';

/** POST { agentId, task, status? } — crée une tâche en base. */
export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Corps JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { agentId, task, status = 'pending' } = body ?? {};
  if (!agentId || !task) {
    return new Response(
      JSON.stringify({ error: 'agentId et task sont requis' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }
  try {
    const now = new Date();
    const [inserted] = await db
      .insert(AgentTask)
      .values({ agentId: String(agentId), task: String(task), status: String(status), createdAt: now, updatedAt: now })
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
  source: 'db' | 'gateway';
};

export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email as string | undefined;

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

  const gatewayTasks: TaskRow[] = [];
  if (email) {
    const result = await fetchOpenClawSessionsPayload(email);
    if (result.ok) {
      const sessions = normalizeOpenClawSessions(result.data);
      const rows = sessions.map(mapSessionToAgentRow);
      rows.sort((a, b) => b.lastSeenMs - a.lastSeenMs);
      for (const r of rows.slice(0, 40)) {
        gatewayTasks.push({
          id: `gw-${r.id}`,
          agentId: r.name,
          task: `Session OpenClaw · ${r.model !== '—' ? r.model : String(r.id).slice(0, 12)}`,
          status: r.status === 'actif' ? 'running' : 'success',
          createdAt: new Date(r.lastSeenMs).toISOString(),
          updatedAt: new Date(r.lastSeenMs).toISOString(),
          source: 'gateway',
        });
      }
    }
  }

  const merged = [...gatewayTasks, ...dbTasks];
  merged.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return new Response(
    JSON.stringify({
      tasks: merged,
      gatewayCount: gatewayTasks.length,
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
export const PUT: APIRoute = async ({ request }) => {
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
    await db
      .update(AgentTask)
      .set({
        status: String(status),
        output: output ? String(output) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(AgentTask.id, Number(id)));
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
