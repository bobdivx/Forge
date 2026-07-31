import type { APIRoute } from 'astro';
import { FORGE_SWARM_AGENT_COUNT } from '../../lib/agent-instruction-defaults';
import { loadAstroDb } from '../../lib/load-astro-db';
import {
  fetchZimaOSSessionsPayload,
  normalizeZimaOSSessions,
} from '../../lib/forge-gateway';

function countRunningSessions(sessions: unknown[]): number {
  return sessions.filter((s) => {
    const row = s && typeof s === 'object' ? (s as Record<string, unknown>) : {};
    const st = String(row.status || row.state || '').toLowerCase();
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
  // Initiate slow external network call early to run concurrently with database queries.
  // Attach a dummy catch to prevent UnhandledPromiseRejection if it fails before we await it.
  const zimaosPromise = fetchZimaOSSessionsPayload(undefined);
  zimaosPromise.catch(() => {});

  const base = {
    projectCount: 0,
    tasksTotal: 0,
    tasksToday: 0,
    openRequests: 0,
    openAppIssues: 0,
    openDependencyRequests: 0,
    forgeSwarmTargetCount: FORGE_SWARM_AGENT_COUNT,
    zimaosOk: false,
    zimaosSessionCount: 0,
    zimaosRunningCount: 0,
    zimaosVia: null as string | null,
    zimaosError: null as string | null,
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
    const zimaosResult = await zimaosPromise;
    const ocSessions = zimaosResult.ok
      ? (normalizeZimaOSSessions(zimaosResult.data) as Record<string, unknown>[])
      : [];
    base.zimaosOk = zimaosResult.ok;
    base.zimaosSessionCount = ocSessions.length;
    base.zimaosRunningCount = zimaosResult.ok ? countRunningSessions(ocSessions) : 0;
    base.zimaosVia = zimaosResult.via ?? null;
    base.zimaosError = zimaosResult.ok ? null : zimaosResult.error ?? null;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    base.zimaosError = msg || 'ZimaOS : erreur inattendue';
    if (import.meta.env.DEV) {
      console.error('[dashboard-kpis] ZimaOS:', e);
    }
  }

  return new Response(JSON.stringify(base), { status: 200, headers: { 'Content-Type': 'application/json' } });
};
