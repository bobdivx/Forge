// @ts-nocheck
/**
 * Outils « swarm » : propositions d’anomalies, idées, sous-agents, délégation, audit.
 * Importé par forge-tools.ts — gardez les dépendances dynamiques pour éviter les cycles.
 */
import fs from 'fs';
import path from 'path';
import { eq, desc, sql } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { insertForgeActivityLog } from './forge-activity-log';
import { ensureForgeProjectScopedAgent } from './forge-project-scoped-agents';
import { resolveProjectPath } from './forge-repos';
import { runZimaosIntegrationScan } from './audit-forge-integration-scan';
import { normalizeErrorType } from './forge-agent-work';
import type { ForgeTool, ToolContext, ToolResult } from './forge-tools';

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j] + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

async function proposalQuotaOk(actorId: string, maxPerHour = 8): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { db, ActivityLog } = await loadAstroDb();
    const since = new Date(Date.now() - 60 * 60 * 1000);
    const rows = await db.select().from(ActivityLog).orderBy(desc(ActivityLog.createdAt)).limit(400);
    let n = 0;
    for (const r of rows) {
      if (String(r.actorId) !== actorId) continue;
      const t = r.createdAt instanceof Date ? r.createdAt.getTime() : new Date(String(r.createdAt)).getTime();
      if (t < since.getTime()) continue;
      const act = String(r.action || '');
      if (act.startsWith('swarm.agent.proposed')) n++;
    }
    if (n >= maxPerHour) return { ok: false, reason: `Quota horaire atteint (${n}/${maxPerHour}).` };
    return { ok: true };
  } catch {
    return { ok: true };
  }
}

async function findProjectByName(name: string) {
  const { db, Project } = await loadAstroDb();
  const rows = await db.select().from(Project);
  const q = String(name || '').trim().toLowerCase();
  return rows.find((p) => String(p.name || '').toLowerCase() === q) || null;
}

const proposeBug: ForgeTool<
  { project: string; title: string; detail?: string; errorType?: string; assigneeAgentId?: string },
  { issueId?: number }
> = {
  name: 'propose_bug',
  description:
    "Crée une entrée AgentAppIssue (bug/anomalie) pour un projet Forge. Utilise après lecture de fichiers ou audit.",
  category: 'swarm',
  params: {
    project: { type: 'string', description: 'Nom du projet (dossier / Project.name)', required: true },
    title: { type: 'string', description: 'Titre court', required: true },
    detail: { type: 'string', description: 'Détail', required: false },
    errorType: {
      type: 'string',
      description: 'code_smell | security | perf | bug | obsolete_dep | other',
      required: false,
    },
    assigneeAgentId: { type: 'string', description: 'Assigné (défaut CHEF_TECHNIQUE)', required: false },
  },
  execute: async (input, ctx: ToolContext): Promise<ToolResult<{ issueId?: number }>> => {
    const actor = String(ctx.agentId || '').trim();
    if (!actor) {
      return { ok: false, output: {}, error: 'agentId manquant (contexte orchestrateur)', durationMs: 0, toolName: 'propose_bug' };
    }
    const quota = await proposalQuotaOk(actor);
    if (!quota.ok) {
      return { ok: false, output: {}, error: quota.reason || 'quota', durationMs: 0, toolName: 'propose_bug' };
    }
    const proj = await findProjectByName(String(input.project || ''));
    if (!proj) {
      return { ok: false, output: {}, error: `Projet introuvable: ${input.project}`, durationMs: 0, toolName: 'propose_bug' };
    }
    const title = String(input.title || '').trim().slice(0, 500);
    if (!title) {
      return { ok: false, output: {}, error: 'title requis', durationMs: 0, toolName: 'propose_bug' };
    }
    const et = normalizeErrorType(String(input.errorType || 'bug'));
    const assignee = String(input.assigneeAgentId || 'CHEF_TECHNIQUE').trim() || 'CHEF_TECHNIQUE';

    const { db, AgentAppIssue } = await loadAstroDb();
    const openRows = await db.select().from(AgentAppIssue).limit(300);
    const openSameProject = openRows.filter(
      (i) =>
        Number(i.projectId) === Number(proj.id) &&
        String(i.status || '').toLowerCase() !== 'resolved' &&
        String(i.status || '').toLowerCase() !== 'wont_fix',
    );
    for (const o of openSameProject) {
      const sim =
        1 -
        levenshtein(title.toLowerCase(), String(o.title || '').toLowerCase()) /
          Math.max(title.length, String(o.title || '').length, 1);
      if (sim >= 0.85) {
        await insertForgeActivityLog({
          actorType: 'agent',
          actorId: actor,
          action: 'swarm.agent.proposed_duplicate',
          entityType: 'agent_app_issue',
          entityId: String(o.id),
          details: { mergedInto: o.id, title },
        });
        return {
          ok: true,
          output: { issueId: o.id },
          durationMs: 0,
          toolName: 'propose_bug',
        };
      }
    }

    const now = new Date();
    const [row] = await db
      .insert(AgentAppIssue)
      .values({
        projectId: proj.id,
        url: `forge://agent-proposal/temp`,
        errorType: et,
        title,
        detail: input.detail ? String(input.detail).slice(0, 12000) : undefined,
        status: 'open',
        reportedByAgentId: actor,
        assigneeAgentId: assignee,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    const id = row?.id;
    if (id != null) {
      await db
        .update(AgentAppIssue)
        .set({
          url: `forge://app-issue/${id}`,
          updatedAt: new Date(),
        })
        .where(eq(AgentAppIssue.id, id));
    }

    await insertForgeActivityLog({
      actorType: 'agent',
      actorId: actor,
      action: 'swarm.agent.proposed_bug',
      entityType: 'agent_app_issue',
      entityId: String(id ?? '?'),
      details: { title: title.slice(0, 200), project: proj.name },
    });

    const { triggerDispatchNow } = await import('./forge-work-scheduler');
    await triggerDispatchNow([assignee]).catch(() => {});

    return { ok: true, output: { issueId: id }, durationMs: 0, toolName: 'propose_bug' };
  },
};

const proposeImprovement: ForgeTool<
  { project: string; title: string; detail?: string; assigneeAgentId?: string },
  { requestId?: number }
> = {
  name: 'propose_improvement',
  description: 'Crée une demande Request de type « Amélioration » dans le carnet.',
  category: 'swarm',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
    title: { type: 'string', description: 'Titre', required: true },
    detail: { type: 'string', description: 'Détail', required: false },
    assigneeAgentId: { type: 'string', description: 'Assigné (optionnel)', required: false },
  },
  execute: async (input, ctx: ToolContext): Promise<ToolResult<{ requestId?: number }>> => {
    const actor = String(ctx.agentId || '').trim();
    if (!actor) {
      return {
        ok: false,
        output: {},
        error: 'agentId manquant',
        durationMs: 0,
        toolName: 'propose_improvement',
      };
    }
    const quota = await proposalQuotaOk(actor);
    if (!quota.ok) {
      return { ok: false, output: {}, error: quota.reason || 'quota', durationMs: 0, toolName: 'propose_improvement' };
    }
    const proj = await findProjectByName(String(input.project || ''));
    if (!proj) {
      return { ok: false, output: {}, error: `Projet introuvable: ${input.project}`, durationMs: 0, toolName: 'propose_improvement' };
    }
    const title = String(input.title || '').trim().slice(0, 500);
    const { db, Request } = await loadAstroDb();
    const now = new Date();
    const [row] = await db
      .insert(Request)
      .values({
        projectId: proj.id,
        title,
        content: input.detail ? String(input.detail).slice(0, 8000) : '',
        status: 'pending',
        priority: 'medium',
        author: actor,
        requestType: 'Amélioration',
        assigneeAgentId: String(input.assigneeAgentId || 'CHEF_TECHNIQUE').trim() || 'CHEF_TECHNIQUE',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await insertForgeActivityLog({
      actorType: 'agent',
      actorId: actor,
      action: 'swarm.agent.proposed_improvement',
      entityType: 'request',
      entityId: String(row?.id ?? '?'),
      details: { title: title.slice(0, 200) },
    });

    const { triggerDispatchNow } = await import('./forge-work-scheduler');
    await triggerDispatchNow([
      String(input.assigneeAgentId || 'CHEF_TECHNIQUE').trim() || 'CHEF_TECHNIQUE',
    ]).catch(() => {});

    return { ok: true, output: { requestId: row?.id }, durationMs: 0, toolName: 'propose_improvement' };
  },
};

const spawnSubagent: ForgeTool<
  { parentAgentId: string; projectId: number; reason?: string },
  { agentId?: string; runId?: number }
> = {
  name: 'spawn_subagent',
  description: 'Provisionne un sous-agent projet (`…__APP_…`) si le parent est autorisé.',
  category: 'swarm',
  params: {
    parentAgentId: { type: 'string', description: 'Agent parent (CHEF_TECHNIQUE ou ARCHITECTE_LOGICIEL)', required: true },
    projectId: { type: 'number', description: 'ID projet Forge', required: true },
    reason: { type: 'string', description: 'Raison courte', required: false },
  },
  execute: async (input, ctx: ToolContext): Promise<ToolResult<{ agentId?: string; runId?: number }>> => {
    const caller = String(ctx.agentId || '').trim().toUpperCase();
    const parent = String(input.parentAgentId || '').trim().toUpperCase();
    const allowedCaller = ['CHEF_TECHNIQUE', 'ARCHITECTE_LOGICIEL'];
    if (!allowedCaller.includes(caller)) {
      return {
        ok: false,
        output: {},
        error: 'Seuls CHEF_TECHNIQUE et ARCHITECTE_LOGICIEL peuvent spawn un sous-agent.',
        durationMs: 0,
        toolName: 'spawn_subagent',
      };
    }
    const allowedParent = ['CHEF_TECHNIQUE', 'ARCHITECTE_LOGICIEL'];
    if (!allowedParent.includes(parent)) {
      return { ok: false, output: {}, error: 'parentAgentId invalide', durationMs: 0, toolName: 'spawn_subagent' };
    }
    const pid = Number(input.projectId);
    if (!Number.isFinite(pid)) {
      return { ok: false, output: {}, error: 'projectId invalide', durationMs: 0, toolName: 'spawn_subagent' };
    }
    const res = await ensureForgeProjectScopedAgent({ parentAgentId: parent, projectId: pid });
    // Registry — création d'une ligne SubagentRun pour traçabilité.
    let runId: number | undefined;
    try {
      const { startSubagentRun } = await import('./forge-subagent-registry');
      const run = await startSubagentRun({
        parentAgentId: parent,
        childAgentId: String(res.agentId || ''),
        projectId: pid,
        reason: input.reason,
      });
      runId = run?.id;
    } catch {
      /* registry indisponible — non bloquant */
    }
    await insertForgeActivityLog({
      actorType: 'agent',
      actorId: caller,
      action: 'swarm.agent.spawned_subagent',
      entityType: 'agent_instruction',
      entityId: String(res.agentId || ''),
      details: { parent, projectId: pid, reason: String(input.reason || '').slice(0, 300), created: res.created, runId },
    });
    return { ok: true, output: { agentId: res.agentId, runId }, durationMs: 0, toolName: 'spawn_subagent' };
  },
};

const delegateTask: ForgeTool<
  { targetAgentId: string; task: string; input?: string; projectId?: number },
  { taskId?: number }
> = {
  name: 'delegate_task',
  description: 'Insère une AgentTask pending pour un autre agent et tente un dispatch immédiat.',
  category: 'swarm',
  params: {
    targetAgentId: { type: 'string', description: 'Agent cible', required: true },
    task: { type: 'string', description: 'Intitulé', required: true },
    input: { type: 'string', description: 'Corps', required: false },
    projectId: { type: 'number', description: 'ID projet optionnel', required: false },
  },
  execute: async (input, ctx: ToolContext): Promise<ToolResult<{ taskId?: number }>> => {
    const actor = String(ctx.agentId || '').trim();
    const target = String(input.targetAgentId || '').trim();
    const task = String(input.task || '').trim();
    if (!target || !task) {
      return { ok: false, output: {}, error: 'targetAgentId et task requis', durationMs: 0, toolName: 'delegate_task' };
    }
    const { db, AgentTask } = await loadAstroDb();
    const now = new Date();
    const [row] = await db
      .insert(AgentTask)
      .values({
        agentId: target,
        task: `[Délégation depuis ${actor}] ${task}`.slice(0, 1200),
        input: input.input ? String(input.input).slice(0, 120000) : undefined,
        status: 'pending',
        projectId:
          input.projectId != null && Number.isFinite(Number(input.projectId))
            ? Number(input.projectId)
            : undefined,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await insertForgeActivityLog({
      actorType: 'agent',
      actorId: actor || 'unknown',
      action: 'swarm.agent.delegated_task',
      entityType: 'agent_task',
      entityId: String(row?.id ?? '?'),
      details: { target, title: task.slice(0, 200) },
    });

    const { triggerDispatchNow } = await import('./forge-work-scheduler');
    await triggerDispatchNow([target]).catch(() => {});

    return { ok: true, output: { taskId: row?.id }, durationMs: 0, toolName: 'delegate_task' };
  },
};

const auditProject: ForgeTool<{ project: string; scope?: string }, { report?: string }> = {
  name: 'audit_project',
  description: 'Audit statique léger du dossier src + résumé package.json.',
  category: 'swarm',
  params: {
    project: { type: 'string', description: 'Nom du projet', required: true },
    scope: { type: 'string', description: 'full | code_only | deps | security', required: false },
  },
  execute: async (input, _ctx: ToolContext): Promise<ToolResult<{ report?: string }>> => {
    const dir = await resolveProjectPath(String(input.project || ''));
    if (!dir) {
      return { ok: false, output: {}, error: 'Projet introuvable', durationMs: 0, toolName: 'audit_project' };
    }
    const srcRoot = path.join(dir, 'src');
    const rootForScan = fs.existsSync(srcRoot) ? srcRoot : dir;
    const scan = runZimaosIntegrationScan(rootForScan);
    let pkgHint = '';
    try {
      const pkgPath = path.join(dir, 'package.json');
      const raw = fs.readFileSync(pkgPath, 'utf8');
      const pkg = JSON.parse(raw);
      const depCount = Object.keys(pkg.dependencies || {}).length;
      const devCount = Object.keys(pkg.devDependencies || {}).length;
      pkgHint = `\npackage.json: dependencies=${depCount}, devDependencies=${devCount}`;
    } catch {
      pkgHint = '\npackage.json: illisible';
    }
    const rep =
      `Audit ${String(input.scope || 'full')} pour ${input.project}\n` +
      `Fichiers touchés: ${scan.summary.filesWithHits}/${scan.summary.totalFiles} · hits: ${scan.summary.hitCount}\n` +
      pkgHint +
      `\n(Pour créer des bugs : utilise propose_bug avec les findings ci-dessus.)`;
    return { ok: true, output: { report: rep.slice(0, 12000) }, durationMs: 0, toolName: 'audit_project' };
  },
};

export const swarmTools: ForgeTool[] = [
  proposeBug as ForgeTool,
  proposeImprovement as ForgeTool,
  spawnSubagent as ForgeTool,
  delegateTask as ForgeTool,
  auditProject as ForgeTool,
];
