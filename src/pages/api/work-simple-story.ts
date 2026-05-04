import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import { getWorkSystemStatus } from '../../lib/forge-work-scheduler';
import { resolveProjectPathFromDbProject } from '../../lib/forge-repos';
import { getRepoGitSnapshot, type RepoGitSnapshot } from '../../lib/forge-repo-git-snapshot';

/** Extraits chemins de fichiers mentionnés dans la réponse agent (heuristique). */
function extractFileHints(text: string): string[] {
  const s = String(text || '');
  const re =
    /\b(?:\.?\/)?[\w\-./]+?\.(?:ts|tsx|js|jsx|mjs|cjs|astro|json|md|mdx|css|scss|yml|yaml|toml|sh|ps1|py|go|rs)\b/gi;
  const out = new Set<string>();
  let m: RegExpExecArray | null;
  const r = new RegExp(re.source, re.flags);
  while ((m = r.exec(s)) !== null) {
    const t = m[0].replace(/^\.\//, '').slice(0, 200);
    if (t.length > 3 && !/^https?:/.test(t)) out.add(t);
    if (out.size >= 12) break;
  }
  return [...out];
}

type Delivery =
  | 'pushed'
  | 'committed'
  | 'no_action_needed'
  | 'queued'
  | 'agent_running'
  | 'agent_done'
  | 'unknown';

function inferDelivery(taskStatus: string | undefined, output: string): Delivery {
  const st = String(taskStatus || '').toLowerCase();
  const o = String(output || '').toLowerCase();
  if (/git\s+push|poussé|poussée|pushed to|push successful/i.test(o)) return 'pushed';
  if (/git\s+commit|commit\s+(créé|fait|ok)|committed/i.test(o)) return 'committed';
  if (
    /rien à faire|déjà\s+(fusionn|merg)|already merged|aucune modification|no changes|skip/i.test(o) ||
    /pas pertinent|non nécessaire/.test(o)
  ) {
    return 'no_action_needed';
  }
  if (st === 'running') return 'agent_running';
  if (st === 'pending' || st === 'bug') return 'queued';
  if (st === 'completed' || st === 'done') return 'agent_done';
  return 'unknown';
}

function rankTaskStatus(s: string): number {
  const x = String(s || '').toLowerCase();
  if (x === 'running') return 4;
  if (x === 'pending' || x === 'bug') return 3;
  if (x === 'completed' || x === 'done') return 2;
  return 1;
}

function buildIssueTaskMap(
  tasks: {
    id: number;
    agentId: string;
    task: string | null;
    input: string | null;
    status: string;
    output: string | null;
    updatedAt: Date | string;
  }[],
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

function workStateLabel(state: string): string {
  switch (state) {
    case 'running':
      return 'une session de travail est en cours';
    case 'scheduled':
      return 'le travail est planifié (horaires / fenêtres)';
    case 'stopped':
    default:
      return 'le travail automatique est arrêté (démarrez depuis le panneau ci-dessous)';
  }
}

export const GET: APIRoute = async () => {
  try {
    const work = await getWorkSystemStatus();
    const { db, AgentAppIssue, AgentTask, Project } = await loadAstroDb();

    const projectRows = await db.select().from(Project);
    const nameById: Record<number, string> = {};
    const swarmNames: string[] = [];
    for (const p of projectRows) {
      nameById[p.id] = p.name;
      if (Number(p.swarmEnabled) === 1) swarmNames.push(p.name);
    }

    const tasks = await db
      .select()
      .from(AgentTask)
      .orderBy(desc(AgentTask.updatedAt))
      .limit(500);
    const issueTaskMap = buildIssueTaskMap(tasks);

    const pendingQueueCount = tasks.filter((t) =>
      ['pending', 'bug'].includes(String(t.status).toLowerCase()),
    ).length;

    const issues = await db.select().from(AgentAppIssue).orderBy(desc(AgentAppIssue.updatedAt)).limit(120);

    const gitByPath = new Map<string, RepoGitSnapshot>();

    async function gitForProjectId(projectId: number | null): Promise<RepoGitSnapshot | null> {
      if (projectId == null) return null;
      const proj = projectRows.find((p) => p.id === projectId);
      if (!proj) return null;
      const resolved = await resolveProjectPathFromDbProject(proj);
      if (!resolved) {
        return { ok: false, error: 'Dépôt introuvable (chemin projet / racine FORGE_REPOS_ROOT).' };
      }
      if (gitByPath.has(resolved)) return gitByPath.get(resolved)!;
      const snap = await getRepoGitSnapshot(resolved);
      gitByPath.set(resolved, snap);
      return snap;
    }

    const filtered = issues
      .filter((i) => ['pr_review', 'ci_cd_failure'].includes(String(i.errorType)))
      .slice(0, 25);

    const stories = await Promise.all(
      filtered.map(async (issue) => {
        const task = issueTaskMap.get(issue.id);
        const out = task?.output != null ? String(task.output) : '';
        const files = extractFileHints(out);
        const delivery = inferDelivery(task?.status, out);
        const app = issue.projectId != null ? nameById[issue.projectId] ?? '—' : '—';
        const authorMatch = String(issue.title || '').match(/\bpar\s+(\w+)/i);
        const prAuthor = authorMatch?.[1] ?? null;

        let step: string;
        const ist = String(issue.status || '').toLowerCase();
        const tst = task ? String(task.status || '').toLowerCase() : '';
        if (ist === 'resolved' || ist === 'wont_fix') {
          step = 'Clôturé côté carnet';
        } else if (tst === 'running') {
          step = "L'agent traite la tâche maintenant";
        } else if (tst === 'pending' || tst === 'bug') {
          step =
            pendingQueueCount > 1
              ? `En file d'attente (${pendingQueueCount} tâches au total dans Forge)`
              : "En file d'attente — sera pris bientôt";
        } else if (tst === 'completed' || tst === 'done') {
          step = "L'agent a terminé son passage (voir synthèse ci-dessous)";
        } else if (!task) {
          step = 'Détecté — pas encore converti en tâche agent';
        } else {
          step = 'Suivi en cours';
        }

        const git = await gitForProjectId(issue.projectId != null ? Number(issue.projectId) : null);

        return {
          issueId: issue.id,
          kind: String(issue.errorType),
          app,
          title: String(issue.title || ''),
          url: String(issue.url || ''),
          issueStatus: String(issue.status),
          assignee: issue.assigneeAgentId ? String(issue.assigneeAgentId) : null,
          prAuthor,
          step,
          taskId: task?.id ?? null,
          taskAgentId: task?.agentId ?? null,
          taskStatus: task?.status ?? null,
          snippet: out.replace(/\s+/g, ' ').trim().slice(0, 420),
          files,
          delivery,
          git,
        };
      }),
    );

    return new Response(
      JSON.stringify({
        ok: true,
        work: {
          state: work.state,
          schedulerActive: work.schedulerActive,
          lastStartedAt: work.lastStartedAt ? work.lastStartedAt.toISOString() : null,
          summaryLine: workStateLabel(work.state),
        },
        apps: { swarmEnabled: swarmNames, swarmCount: swarmNames.length },
        pendingQueueCount,
        stories,
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
