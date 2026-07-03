import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';

export type WorkOverviewIssue = {
  id: number;
  projectId: number | null;
  projectName: string;
  title: string;
  url: string;
  errorType: string;
  status: string;
  reportedByAgentId: string;
  assigneeAgentId: string | null;
  createdAt: string;
  updatedAt: string;
  /** github | detector | agent */
  source: 'github' | 'detector' | 'agent';
  kanbanColumn: 'detected' | 'dispatched' | 'running' | 'resolved';
  linkedTask: {
    id: number;
    agentId: string;
    status: string;
    updatedAt: string;
  } | null;
  /** 7 derniers jours — activité relative (création / MAJ) */
  sparkline: number[];
};

function classifySource(reportedBy: string): WorkOverviewIssue['source'] {
  const r = String(reportedBy || '').trim();
  if (r === 'SYSTEM_GITHUB') return 'github';
  if (r === 'BUG_DETECTOR') return 'detector';
  return 'agent';
}

function rankTaskStatus(s: string): number {
  const x = String(s || '').toLowerCase();
  if (x === 'running') return 4;
  if (x === 'pending' || x === 'bug') return 3;
  if (x === 'completed' || x === 'done') return 2;
  return 1;
}

function buildIssueTaskMap(
  tasks: { id: number; agentId: string; task: string | null; input: string | null; status: string; updatedAt: Date | string }[],
): Map<number, (typeof tasks)[0]> {
  const map = new Map<number, (typeof tasks)[0]>();
  const time = (t: (typeof tasks)[0]) =>
    t.updatedAt instanceof Date ? t.updatedAt.getTime() : new Date(String(t.updatedAt || 0)).getTime();
  for (const t of tasks) {
    const blob = `${t.task ?? ''}\n${t.input ?? ''}`;
    const m = blob.match(/AppIssue\s*#(\d+)/i);
    if (!m) continue;
    const issueId = Number(m[1]);
    if (!Number.isFinite(issueId)) continue;
    const prev = map.get(issueId);
    const r = rankTaskStatus(t.status);
    const pr = prev ? rankTaskStatus(prev.status) : 0;
    if (!prev || r > pr || (r === pr && time(t) > time(prev))) {
      map.set(issueId, t);
    }
  }
  return map;
}

function kanbanForIssue(
  issue: { status: string; id: number },
  task: { status: string } | undefined,
): WorkOverviewIssue['kanbanColumn'] {
  const ist = String(issue.status || '').toLowerCase();
  if (ist === 'resolved' || ist === 'wont_fix') return 'resolved';
  const ts = task ? String(task.status || '').toLowerCase() : '';
  if (ts === 'running') return 'running';
  if (ist === 'in_progress' || ts === 'pending' || ts === 'bug') return 'dispatched';
  return 'detected';
}

function isAgentLikeAuthor(author: string | null | undefined): boolean {
  const a = String(author || '').trim();
  if (!a) return false;
  if (/^(utilisateur|Mathieu|HUMAIN|dashboard)$/i.test(a)) return false;
  return /^[A-Z][A-Z0-9_]*(__[A-Z0-9_]+)?$/.test(a);
}

function sparklineForIssue(createdAt: Date | string, updatedAt: Date | string): number[] {
  const c = createdAt instanceof Date ? createdAt : new Date(String(createdAt));
  const u = updatedAt instanceof Date ? updatedAt : new Date(String(updatedAt));
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  const out: number[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const next = new Date(day);
    next.setDate(day.getDate() + 1);
    let v = 0;
    if (c >= day && c < next) v += 2;
    if (u >= day && u < next && u.getTime() !== c.getTime()) v += 1;
    out.push(Math.min(3, v));
  }
  return out;
}

/** GET — agrégats carnet : projets, anomalies enrichies, séries 30j, idées agents */
export const GET: APIRoute = async () => {
  try {
    const { db, AgentAppIssue, AgentTask, AgentDependencyRequest, Request, Project, desc } = await loadAstroDb();

    const [projectRows, issues, taskRows, requestRows, depRows] = await Promise.all([
      db.select().from(Project),
      db.select().from(AgentAppIssue).orderBy(desc(AgentAppIssue.createdAt)).limit(400),
      db.select().from(AgentTask).limit(1200),
      db.select().from(Request).orderBy(desc(Request.createdAt)).limit(200),
      db.select().from(AgentDependencyRequest).orderBy(desc(AgentDependencyRequest.createdAt)).limit(120)
    ]);

    const projectNames: Record<number, string> = {};
    for (const p of projectRows) {
      projectNames[p.id] = String(p.name || '');
    }

    const issueTaskMap = buildIssueTaskMap(taskRows);

    const enriched: WorkOverviewIssue[] = issues.map((i) => {
      const ti = issueTaskMap.get(i.id);
      const src = classifySource(String(i.reportedByAgentId || ''));
      const col = kanbanForIssue(i, ti);
      const cr = i.createdAt instanceof Date ? i.createdAt : new Date(String(i.createdAt));
      const up = i.updatedAt instanceof Date ? i.updatedAt : new Date(String(i.updatedAt));
      return {
        id: i.id,
        projectId: i.projectId ?? null,
        projectName: i.projectId != null ? projectNames[i.projectId] ?? '—' : '—',
        title: String(i.title || ''),
        url: String(i.url || ''),
        errorType: String(i.errorType || ''),
        status: String(i.status || ''),
        reportedByAgentId: String(i.reportedByAgentId || ''),
        assigneeAgentId: i.assigneeAgentId ? String(i.assigneeAgentId) : null,
        createdAt: cr.toISOString(),
        updatedAt: up.toISOString(),
        source: src,
        kanbanColumn: col,
        linkedTask: ti
          ? {
              id: ti.id,
              agentId: String(ti.agentId || ''),
              status: String(ti.status || ''),
              updatedAt: ti.updatedAt instanceof Date ? ti.updatedAt.toISOString() : String(ti.updatedAt),
            }
          : null,
        sparkline: sparklineForIssue(cr, up),
      };
    });

    const agentIdeas = requestRows.filter((r) => {
      const rt = String(r.requestType || '');
      if (rt === 'Amélioration') return true;
      return isAgentLikeAuthor(r.author) && (rt === 'Fonctionnalite' || rt === 'Correction');
    });

    const now = new Date();
    const dayKeys: string[] = [];
    for (let d = 29; d >= 0; d--) {
      const x = new Date(now);
      x.setDate(x.getDate() - d);
      dayKeys.push(x.toISOString().slice(0, 10));
    }
    const openedByDay: Record<string, number> = Object.fromEntries(dayKeys.map((k) => [k, 0]));
    const resolvedByDay: Record<string, number> = Object.fromEntries(dayKeys.map((k) => [k, 0]));
    for (const i of issues) {
      const c = i.createdAt instanceof Date ? i.createdAt : new Date(String(i.createdAt));
      const k = c.toISOString().slice(0, 10);
      if (openedByDay[k] !== undefined) openedByDay[k] += 1;
      const st = String(i.status || '').toLowerCase();
      if (st === 'resolved' || st === 'wont_fix') {
        const u = i.updatedAt instanceof Date ? i.updatedAt : new Date(String(i.updatedAt));
        const ku = u.toISOString().slice(0, 10);
        if (resolvedByDay[ku] !== undefined) resolvedByDay[ku] += 1;
      }
    }

    const byProject: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const bySource: Record<string, number> = { github: 0, detector: 0, agent: 0 };
    for (const e of enriched) {
      const pn = e.projectName || '—';
      byProject[pn] = (byProject[pn] || 0) + 1;
      const et = e.errorType || 'other';
      byType[et] = (byType[et] || 0) + 1;
      bySource[e.source] = (bySource[e.source] || 0) + 1;
    }

    const thirtySeries = dayKeys.map((k) => ({
      date: k,
      opened: openedByDay[k] ?? 0,
      resolved: resolvedByDay[k] ?? 0,
    }));

    const proposalsPending = requestRows.filter((r) => String(r.status) === 'pending').length;

    const requestsPreview = requestRows.map((r) => ({
      id: r.id,
      projectId: r.projectId,
      projectName: projectNames[r.projectId] ?? '—',
      title: r.title,
      content: r.content,
      status: r.status,
      priority: r.priority,
      author: r.author,
      requestType: r.requestType,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    }));

    const depsPreview = depRows.map((d) => ({
      id: d.id,
      projectId: d.projectId,
      projectName: d.projectId != null ? projectNames[d.projectId] ?? '—' : '—',
      packageName: d.packageName,
      versionSpec: d.versionSpec,
      status: d.status,
      requestedByAgentId: d.requestedByAgentId,
      createdAt: d.createdAt instanceof Date ? d.createdAt.toISOString() : String(d.createdAt),
    }));

    return new Response(
      JSON.stringify({
        ok: true,
        projects: projectRows.map((p) => ({
          id: p.id,
          name: p.name,
          swarmEnabled: Number(p.swarmEnabled) === 1,
        })),
        issues: enriched,
        requests: requestsPreview,
        dependencies: depsPreview,
        agentIdeas: agentIdeas.map((r) => ({
          id: r.id,
          projectId: r.projectId,
          title: r.title,
          content: r.content,
          status: r.status,
          priority: r.priority,
          author: r.author,
          requestType: r.requestType,
          assigneeAgentId: r.assigneeAgentId,
          createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        })),
        charts: {
          byProject,
          byType,
          bySource,
          thirtySeries,
        },
        counts: {
          issues: issues.length,
          openIssues: issues.filter((i) => {
            const s = String(i.status || '').toLowerCase();
            return s === 'open' || s === 'in_progress';
          }).length,
          requests: requestRows.length,
          deps: depRows.length,
          proposalsPending,
        },
        swarmProjectCount: projectRows.filter((p) => Number(p.swarmEnabled) === 1).length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
