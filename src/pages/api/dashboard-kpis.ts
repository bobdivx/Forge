import type { APIRoute } from 'astro';
import { FORGE_SWARM_AGENT_COUNT } from '../../lib/agent-instruction-defaults';
import { loadAstroDb } from '../../lib/load-astro-db';
import {
  fetchOpenClawSessionsPayload,
  normalizeOpenClawSessions,
} from '../../lib/openclaw-gateway';

function countRunningSessions(sessions: unknown[]): number {
  return sessions.filter((s: Record<string, unknown>) => {
    const st = String(s?.status || s?.state || '').toLowerCase();
    return (
      st === 'running' ||
      st === 'active' ||
      st === 'connected' ||
      st === 'online'
    );
  }).length;
}

function isOpenQueueStatus(st: string): boolean {
  const s = String(st).toLowerCase();
  return s === 'open' || s === 'in_progress';
}

export const GET: APIRoute = async () => {
  const base = {
    projectCount: 0,
    tasksTotal: 0,
    tasksToday: 0,
    openRequests: 0,
    openAppIssues: 0,
    openDependencyRequests: 0,
    forgeSwarmTargetCount: FORGE_SWARM_AGENT_COUNT,
    openclawOk: false,
    openclawSessionCount: 0,
    openclawRunningCount: 0,
    openclawVia: null as string | null,
    openclawError: null as string | null,
    dbError: null as string | null,
  };

  try {
    const { db, Project, AgentTask, Request, AgentAppIssue, AgentDependencyRequest, eq } =
      await loadAstroDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [projects, tasksAll, openRequests, issuesAll, depsAll] = await Promise.all([
      db.select().from(Project),
      db.select().from(AgentTask),
      db.select().from(Request).where(eq(Request.status, 'pending')),
      db.select().from(AgentAppIssue),
      db.select().from(AgentDependencyRequest),
    ]);

    const tasksTodayCount = tasksAll.filter((t) => {
      const d = t.createdAt instanceof Date ? t.createdAt : new Date(t.createdAt as Date);
      return d >= today;
    }).length;

    base.projectCount = projects.length;
    base.tasksTotal = tasksAll.length;
    base.tasksToday = tasksTodayCount;
    base.openRequests = openRequests.length;
    base.openAppIssues = issuesAll.filter((r) => isOpenQueueStatus(String(r.status))).length;
    base.openDependencyRequests = depsAll.filter((r) => isOpenQueueStatus(String(r.status))).length;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    base.dbError = msg;
    if (import.meta.env.DEV) {
      console.error('[dashboard-kpis] lecture base:', e);
    }
    return new Response(JSON.stringify(base), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const openclawResult = await fetchOpenClawSessionsPayload(undefined);
    const ocSessions = openclawResult.ok
      ? (normalizeOpenClawSessions(openclawResult.data) as Record<string, unknown>[])
      : [];
    base.openclawOk = openclawResult.ok;
    base.openclawSessionCount = ocSessions.length;
    base.openclawRunningCount = openclawResult.ok ? countRunningSessions(ocSessions) : 0;
    base.openclawVia = openclawResult.via ?? null;
    base.openclawError = openclawResult.ok ? null : openclawResult.error ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    base.openclawError = msg || 'OpenClaw : erreur inattendue';
    if (import.meta.env.DEV) {
      console.error('[dashboard-kpis] OpenClaw:', e);
    }
  }

  return new Response(JSON.stringify(base), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
