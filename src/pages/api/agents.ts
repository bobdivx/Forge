import type { APIRoute } from 'astro';
import { db, AgentTask, desc } from 'astro:db';
import {
  fetchOpenClawSessionsPayload,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
} from '../../lib/openclaw-gateway';

export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email as string | undefined;

  const result = await fetchOpenClawSessionsPayload(email);

  let agents: any[] = [];
  if (result.ok) {
    const sessions = normalizeOpenClawSessions(result.data);
    agents = sessions.map(mapSessionToAgentRow);
    agents.sort((a, b) => b.lastSeenMs - a.lastSeenMs);
  }

  // Task stats from DB (group by agentId)
  let taskStats: Record<string, { total: number; completed: number; failed: number; running: number; pending: number }> = {};
  try {
    const tasks = await db.select().from(AgentTask).orderBy(desc(AgentTask.createdAt)).limit(500);
    for (const t of tasks) {
      const id = t.agentId;
      if (!taskStats[id]) taskStats[id] = { total: 0, completed: 0, failed: 0, running: 0, pending: 0 };
      taskStats[id].total++;
      const s = String(t.status).toLowerCase();
      if (s === 'completed' || s === 'success') taskStats[id].completed++;
      else if (s === 'failed' || s === 'error') taskStats[id].failed++;
      else if (s === 'running') taskStats[id].running++;
      else taskStats[id].pending++;
    }
  } catch {
    /* DB indisponible */
  }

  return new Response(
    JSON.stringify({
      agents,
      taskStats,
      gatewayError: result.ok ? undefined : result.error,
      gatewayVia: result.via,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
