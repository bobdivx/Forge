import type { APIRoute } from 'astro';
import path from 'node:path';
import { and, desc, eq, inArray, or } from 'drizzle-orm';
import { loadAstroDb } from '../../../../lib/load-astro-db';
import {
  isSafeRepoDirName,
  resolveProjectPathFromDbProject,
  resolveProjectPathVariants,
  repoSlugFromProject,
} from '../../../../lib/forge-repos';
import { getGitCommits, getGitSummary } from '../../../../lib/project-git';

/**
 * Agrège tout ce que les agents ont fait sur un projet :
 * tâches, issues, demandes utilisateur, sessions/étapes de chat, commits Git,
 * journal d'activité, coûts LLM. Renvoie une timeline unifiée et des stats
 * par agent pour alimenter le canvas /apps/[id].
 */

type Kind =
  | 'task'
  | 'issue'
  | 'dependency'
  | 'request'
  | 'commit'
  | 'chat_session'
  | 'chat_step'
  | 'activity'
  | 'cost'
  | 'run';

type TimelineEvent = {
  id: string;
  kind: Kind;
  /** ISO 8601 */
  when: string;
  /** Identifiant agent (ou "user" / "system") quand connu. */
  actorId: string | null;
  actorType: 'agent' | 'user' | 'system' | 'commit';
  title: string;
  summary?: string | null;
  /** Statut métier (statut tâche, issue, request, run...). */
  status?: string | null;
  /** Indice visuel (couleur de la pastille). */
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  /** Liste de fichiers / chemins associés. */
  files?: string[];
  /** Lien interne ou externe (ouvert avec target=_blank quand http). */
  href?: string | null;
  /** Données complémentaires brutes. */
  meta?: Record<string, unknown>;
};

type AgentStat = {
  agentId: string;
  events: number;
  tasks: { total: number; running: number; pending: number; done: number; failed: number };
  issues: number;
  commits: number;
  costCents: number;
  lastEventAt: string | null;
};

function toIso(d: unknown): string {
  if (d instanceof Date) return d.toISOString();
  if (typeof d === 'string') {
    const parsed = new Date(d);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : new Date(0).toISOString();
  }
  return new Date(0).toISOString();
}

function safeStr(v: unknown, max = 4000): string {
  return String(v ?? '').slice(0, max);
}

function tinySummary(v: unknown, max = 320): string {
  return safeStr(v, max).replace(/\s+/g, ' ').trim().slice(0, max);
}

function statusToTone(status: string): TimelineEvent['tone'] {
  const s = status.toLowerCase();
  if (['done', 'completed', 'succeeded', 'resolved', 'pushed', 'committed', 'installed', 'approved'].includes(s)) {
    return 'success';
  }
  if (['running', 'in_progress', 'queued'].includes(s)) return 'info';
  if (['pending', 'open'].includes(s)) return 'warning';
  if (['failed', 'rejected', 'cancelled', 'timed_out', 'bug', 'wont_fix'].includes(s)) return 'danger';
  return 'neutral';
}

function extractFileHints(text: string, max = 8): string[] {
  const s = String(text || '');
  if (!s) return [];
  const re =
    /\b(?:\.?\/)?[\w\-./]+?\.(?:ts|tsx|js|jsx|mjs|cjs|astro|json|md|mdx|css|scss|yml|yaml|toml|sh|ps1|py|go|rs|sql|prisma|html)\b/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(s)) !== null) {
    const t = m[0].replace(/^\.\//, '').slice(0, 200);
    if (t.length > 3 && !/^https?:/.test(t)) out.add(t);
    if (out.size >= max) break;
  }
  return [...out];
}

async function findProjectRow(folderKey: string): Promise<any | null> {
  const { db, Project } = await loadAstroDb();
  const projects = await db.select().from(Project);
  const lower = folderKey.toLowerCase();
  let row = projects.find((p: any) => {
    const slug = repoSlugFromProject(p);
    return (
      slug === folderKey ||
      slug.toLowerCase() === lower ||
      p.name === folderKey ||
      String(p.name).toLowerCase() === lower
    );
  });
  if (row) return row;
  for (const p of projects) {
    const rpath = await resolveProjectPathFromDbProject(p);
    if (rpath && path.basename(rpath) === folderKey) return p;
  }
  return null;
}

export const GET: APIRoute = async ({ params, url }) => {
  const app = params.app;
  if (!isSafeRepoDirName(String(app))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const folderKey = String(app);

  const projectPath = await resolveProjectPathVariants(folderKey);
  const projectRow = await findProjectRow(folderKey);

  if (!projectPath && !projectRow) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }

  const limit = Math.min(
    Math.max(parseInt(url?.searchParams?.get('limit') ?? '120', 10) || 120, 20),
    500,
  );

  const events: TimelineEvent[] = [];
  const stats = new Map<string, AgentStat>();

  function bumpStat(
    agentId: string | null | undefined,
    iso: string,
    patch: (s: AgentStat) => void,
  ) {
    const id = String(agentId || '').trim();
    if (!id) return;
    let s = stats.get(id);
    if (!s) {
      s = {
        agentId: id,
        events: 0,
        tasks: { total: 0, running: 0, pending: 0, done: 0, failed: 0 },
        issues: 0,
        commits: 0,
        costCents: 0,
        lastEventAt: null,
      };
      stats.set(id, s);
    }
    s.events += 1;
    if (!s.lastEventAt || iso > s.lastEventAt) s.lastEventAt = iso;
    patch(s);
  }

  const projectId: number | null = projectRow ? Number(projectRow.id) : null;
  const taskIds = new Set<number>();
  const sessionIds = new Set<string>();

  if (projectId != null) {
    try {
      const { db, AgentTask, AgentAppIssue, AgentDependencyRequest, Request } =
        await loadAstroDb();

      const tasks = await db
        .select()
        .from(AgentTask)
        .where(eq(AgentTask.projectId, projectId))
        .orderBy(desc(AgentTask.updatedAt))
        .limit(200);

      for (const t of tasks) {
        taskIds.add(Number(t.id));
        const iso = toIso(t.updatedAt ?? t.createdAt);
        const status = String(t.status || 'pending');
        const files = extractFileHints(`${t.task ?? ''}\n${t.input ?? ''}\n${t.output ?? ''}`);
        events.push({
          id: `task-${t.id}`,
          kind: 'task',
          when: iso,
          actorId: t.agentId ?? null,
          actorType: 'agent',
          title: tinySummary(t.task, 180) || `Tâche #${t.id}`,
          summary: t.output ? tinySummary(t.output, 320) : t.input ? tinySummary(t.input, 240) : null,
          status,
          tone: statusToTone(status),
          files: files.length ? files : undefined,
          href: `/agents?task=${t.id}`,
          meta: { taskId: t.id },
        });
        bumpStat(t.agentId, iso, (s) => {
          s.tasks.total += 1;
          const k = status.toLowerCase();
          if (k === 'running') s.tasks.running += 1;
          else if (k === 'pending' || k === 'bug') s.tasks.pending += 1;
          else if (k === 'completed' || k === 'done') s.tasks.done += 1;
          else if (k === 'failed' || k === 'cancelled') s.tasks.failed += 1;
        });
      }

      const issues = await db
        .select()
        .from(AgentAppIssue)
        .where(eq(AgentAppIssue.projectId, projectId))
        .orderBy(desc(AgentAppIssue.updatedAt))
        .limit(120);

      for (const i of issues) {
        const iso = toIso(i.updatedAt ?? i.createdAt);
        const status = String(i.status || 'open');
        events.push({
          id: `issue-${i.id}`,
          kind: 'issue',
          when: iso,
          actorId: i.assigneeAgentId ?? i.reportedByAgentId ?? null,
          actorType: 'agent',
          title: `[${i.errorType}] ${tinySummary(i.title, 160)}`,
          summary: i.detail ? tinySummary(i.detail, 320) : null,
          status,
          tone: statusToTone(status),
          href: i.url ? safeStr(i.url, 500) : null,
          meta: {
            issueId: i.id,
            errorType: i.errorType,
            reportedBy: i.reportedByAgentId,
            assignee: i.assigneeAgentId,
          },
        });
        bumpStat(i.assigneeAgentId ?? i.reportedByAgentId, iso, (s) => {
          s.issues += 1;
        });
      }

      const deps = await db
        .select()
        .from(AgentDependencyRequest)
        .where(eq(AgentDependencyRequest.projectId, projectId))
        .orderBy(desc(AgentDependencyRequest.updatedAt))
        .limit(60);

      for (const d of deps) {
        const iso = toIso(d.updatedAt ?? d.createdAt);
        const status = String(d.status || 'open');
        const versionPart = d.versionSpec ? `@${d.versionSpec}` : '';
        events.push({
          id: `dep-${d.id}`,
          kind: 'dependency',
          when: iso,
          actorId: d.assigneeAgentId ?? d.requestedByAgentId ?? null,
          actorType: 'agent',
          title: `Dépendance ${d.isDev ? '(dev) ' : ''}${d.packageName}${versionPart}`,
          summary: d.reason ? tinySummary(d.reason, 240) : null,
          status,
          tone: statusToTone(status),
          meta: {
            requestedBy: d.requestedByAgentId,
            assignee: d.assigneeAgentId,
            isDev: !!d.isDev,
          },
        });
        bumpStat(d.assigneeAgentId ?? d.requestedByAgentId, iso, () => {});
      }

      const requests = await db
        .select()
        .from(Request)
        .where(eq(Request.projectId, projectId))
        .orderBy(desc(Request.updatedAt))
        .limit(60);

      for (const r of requests) {
        const iso = toIso(r.updatedAt ?? r.createdAt);
        const status = String(r.status || 'pending');
        events.push({
          id: `req-${r.id}`,
          kind: 'request',
          when: iso,
          actorId: r.assigneeAgentId ?? null,
          actorType: r.assigneeAgentId ? 'agent' : 'user',
          title: `Demande : ${tinySummary(r.title, 160)}`,
          summary: r.content ? tinySummary(r.content, 320) : null,
          status,
          tone: statusToTone(status),
          meta: {
            requestId: r.id,
            type: r.requestType,
            author: r.author,
            priority: r.priority,
          },
        });
        if (r.assigneeAgentId) {
          bumpStat(r.assigneeAgentId, iso, () => {});
        }
      }

      try {
        const { ForgeChatSession, ForgeChatStep, ForgeChatMessage } = await loadAstroDb();
        const sessions = await db
          .select()
          .from(ForgeChatSession)
          .where(eq(ForgeChatSession.projectId, projectId))
          .orderBy(desc(ForgeChatSession.updatedAt))
          .limit(20);
        for (const s of sessions) {
          sessionIds.add(String(s.id));
          const iso = toIso(s.updatedAt ?? s.createdAt);
          const status = String(s.status || 'active');
          events.push({
            id: `chat-${s.id}`,
            kind: 'chat_session',
            when: iso,
            actorId: s.agentId ?? null,
            actorType: 'agent',
            title: `Chat : ${tinySummary(s.title, 140) || `session ${String(s.id).slice(0, 8)}`}`,
            status,
            tone: statusToTone(status),
            href: `/discussion?session=${encodeURIComponent(String(s.id))}`,
            meta: { sessionId: s.id },
          });
          bumpStat(s.agentId, iso, () => {});
        }

        if (sessionIds.size > 0) {
          const sessionIdArr = [...sessionIds];
          const steps = await db
            .select()
            .from(ForgeChatStep)
            .where(inArray(ForgeChatStep.sessionId, sessionIdArr))
            .orderBy(desc(ForgeChatStep.createdAt))
            .limit(80);
          for (const st of steps) {
            const iso = toIso(st.createdAt);
            const status = String(st.status || 'completed');
            events.push({
              id: `step-${st.id}`,
              kind: 'chat_step',
              when: iso,
              actorId: null,
              actorType: 'system',
              title: `Étape : ${tinySummary(st.label, 140) || st.type}`,
              summary: st.payload ? tinySummary(st.payload, 280) : null,
              status,
              tone: statusToTone(status),
              meta: { stepType: st.type, sessionId: st.sessionId },
            });
          }

          // Quelques derniers messages pour donner du contenu visible.
          const messages = await db
            .select()
            .from(ForgeChatMessage)
            .where(inArray(ForgeChatMessage.sessionId, sessionIdArr))
            .orderBy(desc(ForgeChatMessage.createdAt))
            .limit(40);
          for (const m of messages) {
            const iso = toIso(m.createdAt);
            const role = String(m.role || 'system');
            events.push({
              id: `msg-${m.id}`,
              kind: 'chat_step',
              when: iso,
              actorId: role === 'assistant' ? m.model || 'assistant' : role,
              actorType: role === 'user' ? 'user' : role === 'system' ? 'system' : 'agent',
              title: `Message ${role}${m.model ? ` (${m.model})` : ''}`,
              summary: tinySummary(m.content, 280),
              status: role,
              tone: 'neutral',
              meta: { sessionId: m.sessionId, role },
            });
          }
        }
      } catch {
        /* tables ForgeChat absentes — ignorer */
      }

      try {
        const { ActivityLog } = await loadAstroDb();
        const conditions = [
          and(eq(ActivityLog.entityType, 'project'), eq(ActivityLog.entityId, String(projectId))),
        ];
        if (taskIds.size > 0) {
          conditions.push(
            and(
              eq(ActivityLog.entityType, 'agent_task'),
              inArray(
                ActivityLog.entityId,
                [...taskIds].map((id) => String(id)),
              ),
            ),
          );
          conditions.push(
            and(
              eq(ActivityLog.entityType, 'task'),
              inArray(
                ActivityLog.entityId,
                [...taskIds].map((id) => String(id)),
              ),
            ),
          );
        }
        const logs = await db
          .select()
          .from(ActivityLog)
          .where(or(...conditions))
          .orderBy(desc(ActivityLog.createdAt))
          .limit(80);
        for (const l of logs) {
          const iso = toIso(l.createdAt);
          events.push({
            id: `act-${l.id}`,
            kind: 'activity',
            when: iso,
            actorId: l.actorId ?? null,
            actorType: (l.actorType as TimelineEvent['actorType']) ?? 'system',
            title: `${l.action} (${l.entityType}:${l.entityId})`,
            summary: l.details ? tinySummary(l.details, 240) : null,
            status: l.action,
            tone: 'neutral',
            meta: { entityType: l.entityType, entityId: l.entityId },
          });
          if (l.actorType === 'agent') {
            bumpStat(l.actorId, iso, () => {});
          }
        }
      } catch {
        /* ActivityLog absent */
      }

      if (taskIds.size > 0) {
        try {
          const { CostEvent } = await loadAstroDb();
          const costs = await db
            .select()
            .from(CostEvent)
            .where(inArray(CostEvent.taskId, [...taskIds]))
            .orderBy(desc(CostEvent.occurredAt))
            .limit(80);
          for (const c of costs) {
            const iso = toIso(c.occurredAt);
            events.push({
              id: `cost-${c.id}`,
              kind: 'cost',
              when: iso,
              actorId: c.agentId ?? null,
              actorType: 'agent',
              title: `LLM : ${c.provider}/${c.model}`,
              summary: `${c.inputTokens}+${c.outputTokens} tokens · ${(c.costCents / 100).toFixed(2)} €`,
              status: 'cost',
              tone: 'neutral',
              meta: {
                taskId: c.taskId,
                provider: c.provider,
                inputTokens: c.inputTokens,
                outputTokens: c.outputTokens,
                costCents: c.costCents,
              },
            });
            bumpStat(c.agentId, iso, (s) => {
              s.costCents += Number(c.costCents) || 0;
            });
          }
        } catch {
          /* CostEvent absent */
        }

        try {
          const { HeartbeatRun } = await loadAstroDb();
          const runs = await db
            .select()
            .from(HeartbeatRun)
            .where(inArray(HeartbeatRun.agentId, [...stats.keys()]))
            .orderBy(desc(HeartbeatRun.createdAt))
            .limit(60);
          for (const r of runs) {
            const iso = toIso(r.startedAt ?? r.createdAt);
            const status = String(r.status || 'queued');
            const dur = r.durationMs ? `${(r.durationMs / 1000).toFixed(1)}s` : null;
            events.push({
              id: `run-${r.id}`,
              kind: 'run',
              when: iso,
              actorId: r.agentId ?? null,
              actorType: 'agent',
              title: `Run heartbeat (${r.source}) — ${status}${dur ? ` · ${dur}` : ''}`,
              summary: r.error ? tinySummary(r.error, 280) : null,
              status,
              tone: statusToTone(status),
              meta: { source: r.source, durationMs: r.durationMs ?? null },
            });
          }
        } catch {
          /* HeartbeatRun absent */
        }
      }
    } catch (e) {
      // Astro DB indisponible : on continue avec ce qu'on a (commits Git).
      console.warn('[agent-canvas] db error', e);
    }
  }

  let gitInfo = { isRepo: false, branch: null as string | null, dirty: false };
  if (projectPath) {
    const summary = getGitSummary(projectPath);
    gitInfo = { isRepo: summary.isRepo, branch: summary.branch, dirty: summary.dirty };
    const { commits } = getGitCommits(projectPath, 40);
    for (const c of commits) {
      const iso = c.dateIso || new Date(c.date).toISOString();
      events.push({
        id: `commit-${c.hash}`,
        kind: 'commit',
        when: iso,
        actorId: c.author || null,
        actorType: 'commit',
        title: tinySummary(c.subject, 200),
        summary: null,
        status: 'committed',
        tone: 'success',
        href: `/apps/${encodeURIComponent(folderKey)}/logs#commit-${c.shortHash}`,
        meta: { hash: c.hash, shortHash: c.shortHash, author: c.author },
      });
      // On agrège dans la même map d'agents si l'auteur correspond à un agent connu.
      const matchAgent = [...stats.keys()].find(
        (id) => id.toLowerCase() === String(c.author || '').toLowerCase(),
      );
      if (matchAgent) {
        bumpStat(matchAgent, iso, (s) => {
          s.commits += 1;
        });
      }
    }
  }

  events.sort((a, b) => (a.when < b.when ? 1 : a.when > b.when ? -1 : 0));
  const trimmed = events.slice(0, limit);

  const agents = [...stats.values()].sort((a, b) => b.events - a.events);

  // Comptes par kind sur la totalité (pas seulement la fenêtre limit).
  const counts = events.reduce<Record<Kind, number>>(
    (acc, e) => {
      acc[e.kind] = (acc[e.kind] || 0) + 1;
      return acc;
    },
    {
      task: 0,
      issue: 0,
      dependency: 0,
      request: 0,
      commit: 0,
      chat_session: 0,
      chat_step: 0,
      activity: 0,
      cost: 0,
      run: 0,
    },
  );

  return new Response(
    JSON.stringify({
      project: projectRow
        ? {
            id: Number(projectRow.id),
            name: String(projectRow.name),
            path: projectRow.path ?? null,
            swarmEnabled: Number(projectRow.swarmEnabled || 0) === 1,
          }
        : null,
      folderKey,
      git: gitInfo,
      stats: {
        totalEvents: events.length,
        shownEvents: trimmed.length,
        counts,
      },
      agents,
      events: trimmed,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
