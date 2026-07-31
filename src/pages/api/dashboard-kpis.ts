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

export const GET: APIRoute = async () => {
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
    const { db, Project, AgentTask, Request, AgentAppIssue, AgentDependencyRequest, eq, count, sql } =
      await loadAstroDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      [{ value: projectsCount }],
      [{ value: tasksAllCount }],
      [{ value: tasksTodayCount }],
      [{ value: openRequestsCount }],
      [{ value: openAppIssuesCount }],
      [{ value: openDepsCount }],
    ] = await Promise.all([
      db.select({ value: count() }).from(Project),
      db.select({ value: count() }).from(AgentTask),
      db.select({ value: count() }).from(AgentTask).where(sql`${AgentTask.createdAt} >= ${today.toISOString()}`),
      db.select({ value: count() }).from(Request).where(eq(Request.status, 'pending')),
      db.select({ value: count() }).from(AgentAppIssue).where(sql`LOWER(${AgentAppIssue.status}) IN ('open', 'in_progress')`),
      db.select({ value: count() }).from(AgentDependencyRequest).where(sql`LOWER(${AgentDependencyRequest.status}) IN ('open', 'in_progress')`),
    ]);

    base.projectCount = projectsCount || 0;
    base.tasksTotal = tasksAllCount || 0;
    base.tasksToday = tasksTodayCount || 0;
    base.openRequests = openRequestsCount || 0;
    base.openAppIssues = openAppIssuesCount || 0;
    base.openDependencyRequests = openDepsCount || 0;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    base.dbError = msg;
    if (import.meta.env.DEV) {
      console.error('[dashboard-kpis] lecture base:', e);
    }
    return new Response(JSON.stringify(base), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  try {
    const zimaosResult = await fetchZimaOSSessionsPayload(undefined);
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
