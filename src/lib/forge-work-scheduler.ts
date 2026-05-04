/**
 * Scheduler de travail du swarm Forge.
 *
 * - Source de vérité : base Forge (`AgentTask`, `AgentInstruction`, carnet, anomalies).
 * - Tourne en arrière-plan via setInterval (60 s). Le suivi GitHub CI/PR est déclenché au démarrage
 *   d’un cycle de travail (session ou pulse projet), pas à chaque tick.
 * - Lit les WorkSchedule actifs en DB pour décider si la plage horaire est valide.
 * - Peut être démarré / arrêté manuellement (override = ignore les plages).
 * - Au début d’une session : directives aux agents ciblés via l’orchestrateur Forge,
 *   puis matérialisation des bugs ouverts en `AgentTask` et exécution des tâches `pending` / `bug`.
 * - Pendant la session : redispatch périodique sans renvoyer la directive complète.
 * - Les demandes carnet (`Request` en pending) sont converties en `AgentTask` liées par `[ForgeRequest #id]`.
 * - Journalise dans la table Heartbeat.
 */

import { eq } from 'drizzle-orm';
import { getConfig } from './config-db';
import { loadAstroDb } from './load-astro-db';
import { toAgentPath, translateContentForAgent } from './forge-repos';
import {
  resolveAssigneeForForgeRequest,
  forgeRequestTaskTitle,
  extractForgeRequestIdFromTaskBlob,
  appendForgeDoneFooterToTaskBody,
  buildForgeTaskDispatchFooter,
  stripForgeDoneFooterFromBody,
} from './forge-request-routing';
import { insertForgeActivityLog } from './forge-activity-log';
import { runForgeAgentMessage } from './forge-agent-task-runner';
import {
  ensureForgeProjectScopedAgent,
  cleanupIdleForgeProjectScopedAgents,
  FORGE_PROJECT_CHILD_TOKEN,
} from './forge-project-scoped-agents';
import type { GithubMonitoringScope } from './forge-github-actions';

// ── Types ────────────────────────────────────────────────────────────────────

export type WorkSystemState = 'running' | 'stopped' | 'scheduled';

export type WorkSystemStatus = {
  state: WorkSystemState;
  /** true si le scheduler interne tourne (setInterval actif). */
  schedulerActive: boolean;
  /** Date du dernier démarrage de cycle de travail, ou null. */
  lastStartedAt: Date | null;
  /** Date du dernier arrêt, ou null. */
  lastStoppedAt: Date | null;
  /** true si on est actuellement dans une fenêtre de travail planifiée. */
  inScheduledWindow: boolean;
  /** Prochaine fenêtre de démarrage calculée (ISO string) ou null. */
  nextWindowAt: string | null;
  /** Si true, le dispatch (carnet, tâches en file) est autorisé hors plage en mode planifié. */
  dispatchOutsideScheduledWindow: boolean;
};

/** Retour de `runWorkCycle` / `manualStart` pour affichage API (erreurs Forge, budget). */
export type WorkCycleResult = {
  ok: boolean;
  budgetBlocked?: string;
  forgeErrors?: string[];
  wakeReport?: {
    targeted: number;
    awakened: string[];
    failed: { agentId: string; error: string }[];
    sessionCheck?: {
      active: string[];
      missing: string[];
    };
  };
  error?: string;
};

type WorkScheduleRow = {
  id: number;
  label: string;
  days: string;
  startTime: string;
  endTime: string;
  agentIds: string;
  enabled: number;
};

// ── État interne : singleton process-wide (globalThis) ───────────────────────
/** En dev, Vite peut charger ce module plusieurs fois ; un seul état évite ticks / GitHub doublés. */
const FORGE_SCHEDULER_STORE_KEY = '__forgeSchedulerStore_v1';

type ForgeSchedulerStore = {
  intervalHandle: ReturnType<typeof setInterval> | null;
  initialTickHandle: ReturnType<typeof setTimeout> | null;
  workState: WorkSystemState;
  lastStartedAt: Date | null;
  lastStoppedAt: Date | null;
  currentlyWorking: boolean;
  dispatchInProgress: boolean;
  githubMonitoringInProgress: boolean;
  lastSubagentCleanupAt: number;
  prevScheduledInWindow: boolean;
};

function sched(): ForgeSchedulerStore {
  const g = globalThis as typeof globalThis & Record<string, ForgeSchedulerStore | undefined>;
  if (!g[FORGE_SCHEDULER_STORE_KEY]) {
    g[FORGE_SCHEDULER_STORE_KEY] = {
      intervalHandle: null,
      initialTickHandle: null,
      workState: 'scheduled',
      lastStartedAt: null,
      lastStoppedAt: null,
      currentlyWorking: false,
      dispatchInProgress: false,
      githubMonitoringInProgress: false,
      lastSubagentCleanupAt: 0,
      prevScheduledInWindow: false,
    };
  }
  return g[FORGE_SCHEDULER_STORE_KEY]!;
}

/** Rotation d’audits proactifs quand peu de tâches `running` (veille / analyse / sécurité). */
let idleDiscoveryRound = 0;
const IDLE_DISCOVERY_AGENTS = ['VEILLE_TECH', 'ANALYSTE_CODE', 'SECURITE_CODE'] as const;

function isViteModuleRunnerClosedError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  return /vite module runner has been closed/i.test(message);
}

function stopSchedulerAfterViteClose(source: string, error: unknown): boolean {
  if (!isViteModuleRunnerClosedError(error)) return false;
  console.warn(`[work-scheduler] ${source}: module runner Vite fermé, arrêt du scheduler.`);
  stopScheduler();
  return true;
}

// ── Helpers temps ────────────────────────────────────────────────────────────

function parseHHMM(hhmm: string): { h: number; m: number } {
  const [h, m] = hhmm.split(':').map(Number);
  return { h: isNaN(h) ? 9 : h, m: isNaN(m) ? 0 : m };
}

function toMinutes(h: number, m: number) {
  return h * 60 + m;
}

function nowMinutes(now: Date): number {
  return toMinutes(now.getHours(), now.getMinutes());
}

/**
 * Renvoie true si `now` tombe dans la plage horaire d'une schedule.
 * Jours : 0=dimanche … 6=samedi (aligné sur Date.getDay()).
 */
function isInWindow(row: WorkScheduleRow, now: Date): boolean {
  if (!row.enabled) return false;
  let days: number[] = [];
  try {
    days = JSON.parse(row.days);
  } catch {
    return false;
  }
  if (!days.includes(now.getDay())) return false;

  const cur = nowMinutes(now);
  const { h: sh, m: sm } = parseHHMM(row.startTime);
  const { h: eh, m: em } = parseHHMM(row.endTime);
  const start = toMinutes(sh, sm);
  const end = toMinutes(eh, em);
  return cur >= start && cur < end;
}

/** Calcule (approximativement) la prochaine fenêtre de démarrage (dans les 7 prochains jours). */
function computeNextWindowAt(schedules: WorkScheduleRow[]): string | null {
  if (!schedules.length) return null;
  const now = new Date();
  for (let d = 0; d < 7 * 24 * 60; d++) {
    const candidate = new Date(now.getTime() + d * 60_000);
    for (const s of schedules) {
      if (isInWindow(s, candidate)) return candidate.toISOString();
    }
  }
  return null;
}

/** CHEF et veille en tête, puis le reste — toutes les cibles reçoivent la directive. */
function orderDirectiveTargets(ids: string[]): string[] {
  const uniq = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))];
  const rank = (id: string) => {
    const u = id.toUpperCase();
    if (u === 'CHEF_TECHNIQUE') return 0;
    if (u === 'VEILLE_TECH') return 1;
    return 2;
  };
  return uniq.sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

function normalizeAgentTarget(id: string): string {
  return String(id || '').trim().replace(/^[a-z0-9_-]+\//i, '').toUpperCase();
}

function isAgentTargeted(agentId: string, targetIds: string[]): boolean {
  if (!targetIds.length) return true;
  const agent = normalizeAgentTarget(agentId);
  return targetIds.some((targetId) => {
    const target = normalizeAgentTarget(targetId);
    return agent === target || agent.startsWith(`${target}${FORGE_PROJECT_CHILD_TOKEN}`);
  });
}

async function maybeEnqueueIdleDiscoveryTask(agentIds: string[]): Promise<void> {
  try {
    const { db, AgentTask, Project } = await loadAstroDb();
    const tasks = await db.select().from(AgentTask).limit(800);
    const running = tasks.filter((t) => String(t.status).toLowerCase() === 'running').length;
    if (running >= 2) return;

    const prows = await db.select().from(Project).where(eq(Project.swarmEnabled, 1));
    if (!prows.length) return;

    const tick = idleDiscoveryRound++;
    const agentId = IDLE_DISCOVERY_AGENTS[tick % IDLE_DISCOVERY_AGENTS.length]!;
    if (!isAgentTargeted(agentId, agentIds)) return;

    const busyAudit = tasks.some(
      (t) =>
        String(t.agentId) === agentId &&
        ['pending', 'running', 'bug'].includes(String(t.status).toLowerCase()) &&
        String(t.task || '').includes('[Audit proactif]'),
    );
    if (busyAudit) return;

    const proj = prows[Math.floor(tick / IDLE_DISCOVERY_AGENTS.length) % prows.length]!;
    const taskTitle = `[Audit proactif] ${proj.name}`;
    const input =
      `Analyse le projet « ${proj.name} » (chemin ${proj.path}).\n` +
      `Utilise l’outil audit_project puis propose_bug / propose_improvement si tu identifies des problèmes concrets.`;
    const now = new Date();
    await db.insert(AgentTask).values({
      agentId,
      task: taskTitle,
      input,
      projectId: proj.id,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    await insertForgeActivityLog({
      actorType: 'system',
      actorId: 'work_scheduler',
      action: 'swarm.idle_audit_enqueued',
      entityType: 'agent_task',
      entityId: 'pending',
      details: { agentId, projectId: proj.id },
    });
    /** La file sera traitée au prochain `runDispatchOnly` (tick ≤ 60 s). */
  } catch (e) {
    await insertForgeActivityLog({
      actorType: 'system',
      actorId: 'work_scheduler',
      action: 'swarm.idle_audit_enqueue_failed',
      entityType: 'swarm',
      entityId: 'global',
      details: { error: String(e) },
    });
  }
}

// ── Journalisation ────────────────────────────────────────────────────────────

async function logHeartbeat(level: 'info' | 'warn' | 'error', message: string) {
  try {
    const { loadAstroDb } = await import('./load-astro-db');
    const { db, Heartbeat, ActivityLog } = await loadAstroDb();
    
    // On écrit dans Heartbeat pour le graphique/historique
    await db.insert(Heartbeat).values({ level, message, source: 'WORK_SCHEDULER' });
    
    // On écrit dans ActivityLog pour la visibilité immédiate dans le dashboard (si niveau > info)
    if (level !== 'info') {
        await db.insert(ActivityLog).values({
            actorType: 'system',
            actorId: 'scheduler',
            action: `scheduler.${level}`,
            entityType: 'system',
            entityId: 'work_scheduler',
            details: message,
            createdAt: new Date()
        });
    }
  } catch {
    console.warn('[work-scheduler] log failed:', message);
  }
}

// ── Cycle de travail ──────────────────────────────────────────────────────────

/** Pour chaque AgentAppIssue encore `open`, crée une AgentTask (évite les doublons même texte AppIssue #id). */
async function dispatchOpenAppIssues(agentIds: string[], onlyProjectId?: number) {
  try {
    const { db, AgentAppIssue, AgentTask, Project } = await loadAstroDb();
    const activeProjects = await db.select({ id: Project.id }).from(Project).where(eq(Project.swarmEnabled, 1));
    const activeIds = new Set(activeProjects.map((p) => p.id));

    const issues = await db.select().from(AgentAppIssue).limit(150);
    const open = issues.filter((i) => String(i.status).toLowerCase() === 'open');
    if (!open.length) return;

    const taskRows = await db.select({ task: AgentTask.task, input: AgentTask.input }).from(AgentTask).limit(300);
    const seenIssueIds = new Set<string>();
    for (const t of taskRows) {
      const blob = `${t.task ?? ''}\n${t.input ?? ''}`;
      const m = blob.match(/AppIssue\s*#(\d+)/i);
      if (m) seenIssueIds.add(m[1]);
    }

    for (const issue of open) {
      if (onlyProjectId != null) {
        if (issue.projectId == null || issue.projectId !== onlyProjectId) continue;
      }
      if (issue.projectId != null && !activeIds.has(issue.projectId)) continue;
      const idStr = String(issue.id);

      const parentAssignee = String(issue.assigneeAgentId || 'CHEF_TECHNIQUE').trim() || 'CHEF_TECHNIQUE';
      const scoped = await ensureForgeProjectScopedAgent({
        parentAgentId: parentAssignee,
        projectId: issue.projectId,
      });
      const assignee = scoped.agentId || parentAssignee;
      if (!isAgentTargeted(parentAssignee, agentIds) && !isAgentTargeted(assignee, agentIds)) continue;

      if (seenIssueIds.has(idStr)) {
        if (String(issue.status).toLowerCase() === 'open' || !issue.assigneeAgentId) {
          await db
            .update(AgentAppIssue)
            .set({
              status: 'in_progress',
              assigneeAgentId: String(issue.assigneeAgentId || assignee),
              updatedAt: new Date(),
            })
            .where(eq(AgentAppIssue.id, issue.id));
        }
        continue;
      }

      const taskTitle = `[AppIssue #${issue.id}] ${issue.title}`;
      const taskInputBase = [
        `URL: ${issue.url}`,
        `Type: ${issue.errorType}`,
        issue.detail ? `Détail: ${issue.detail}` : '',
        `Rapporté par: ${issue.reportedByAgentId}`,
      ]
        .filter(Boolean)
        .join('\n');

      const [createdIssueTask] = await db
        .insert(AgentTask)
        .values({
          agentId: assignee,
          task: taskTitle,
          input: taskInputBase,
          projectId: issue.projectId ?? undefined,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (createdIssueTask?.id != null) {
        await db
          .update(AgentTask)
          .set({
            input: appendForgeDoneFooterToTaskBody(createdIssueTask.id, taskInputBase),
            updatedAt: new Date(),
          })
          .where(eq(AgentTask.id, createdIssueTask.id));
        await insertForgeActivityLog({
          actorType: 'system',
          actorId: 'work_scheduler',
          action: 'swarm.issue.task_created',
          entityType: 'agent_task',
          entityId: String(createdIssueTask.id),
          details: {
            appIssueId: issue.id,
            assignee,
            title: String(issue.title || '').slice(0, 240),
          },
        });
        await db
          .update(AgentAppIssue)
          .set({
            status: 'in_progress',
            assigneeAgentId: assignee,
            updatedAt: new Date(),
          })
          .where(eq(AgentAppIssue.id, issue.id));
      }
      seenIssueIds.add(idStr);
    }
  } catch (e) {
    console.warn('[work-scheduler] dispatchOpenAppIssues error:', e);
    await insertForgeActivityLog({
      actorType: 'system',
      actorId: 'work_scheduler',
      action: 'swarm.issue.dispatch_failed',
      entityType: 'agent_app_issue',
      entityId: 'batch',
      details: { error: String(e) },
    });
  }
}

/** Demandes carnet (`Request` pending) → `AgentTask`, puis passage en `in_progress`. */
async function dispatchPendingForgeRequests(agentIds: string[], onlyProjectId?: number) {
  try {
    const { db, Request, AgentTask, Project } = await loadAstroDb();
    const activeProjects = await db
      .select({ id: Project.id })
      .from(Project)
      .where(eq(Project.swarmEnabled, 1));
    const activeIds = new Set(activeProjects.map((p) => p.id));

    const requestRows = await db.select().from(Request).limit(250);
    const pend = requestRows.filter((r) => String(r.status).toLowerCase() === 'pending');
    if (!pend.length) return;

    const taskRows = await db.select().from(AgentTask).limit(400);

    const hasOpenAgentTaskForRequest = (requestId: number): boolean =>
      taskRows.some((t) => {
        const blob = `${t.task ?? ''}\n${t.input ?? ''}`;
        if (extractForgeRequestIdFromTaskBlob(blob) !== requestId) return false;
        const st = String(t.status).toLowerCase();
        return st === 'pending' || st === 'running';
      });

    for (const req of pend) {
      if (onlyProjectId != null && req.projectId !== onlyProjectId) continue;
      if (!activeIds.has(req.projectId)) continue;

      const parentAssignee = resolveAssigneeForForgeRequest(req);
      const scoped = await ensureForgeProjectScopedAgent({
        parentAgentId: parentAssignee,
        projectId: req.projectId,
      });
      const assignee = scoped.agentId || parentAssignee;
      if (!isAgentTargeted(parentAssignee, agentIds) && !isAgentTargeted(assignee, agentIds)) continue;

      if (hasOpenAgentTaskForRequest(req.id)) continue;

      const taskTitle = forgeRequestTaskTitle(req.id, req.title);
      const taskInputBase = [
        `Type: ${req.requestType ?? 'demande'}`,
        `Priorité: ${req.priority ?? 'medium'}`,
        req.content ? `Description:\n${req.content}` : '',
        `Auteur carnet: ${req.author ?? '—'}`,
      ]
        .filter(Boolean)
        .join('\n')
        .slice(0, 120_000);

      const [createdReqTask] = await db
        .insert(AgentTask)
        .values({
          agentId: assignee,
          task: taskTitle,
          input: taskInputBase,
          projectId: req.projectId,
          status: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (createdReqTask?.id != null) {
        await db
          .update(AgentTask)
          .set({
            input: appendForgeDoneFooterToTaskBody(createdReqTask.id, taskInputBase),
            updatedAt: new Date(),
          })
          .where(eq(AgentTask.id, createdReqTask.id));
      }

      await db
        .update(Request)
        .set({ status: 'in_progress', updatedAt: new Date() })
        .where(eq(Request.id, req.id));

      if (createdReqTask?.id != null) {
        await insertForgeActivityLog({
          actorType: 'system',
          actorId: 'work_scheduler',
          action: 'swarm.request.dispatched',
          entityType: 'request',
          entityId: String(req.id),
          details: {
            taskId: createdReqTask.id,
            assignee,
            title: String(req.title || '').slice(0, 240),
            requestType: req.requestType ?? null,
          },
        });
      }
    }
  } catch (e) {
    console.warn('[work-scheduler] dispatchPendingForgeRequests error:', e);
  }
}

async function dispatchPendingTasks(agentIds: string[], onlyProjectId?: number) {
  try {
    const { db, AgentTask, Project } = await loadAstroDb();

    // Récupération des projets activés pour le filtrage
    const activeProjects = await db.select({ id: Project.id }).from(Project).where(eq(Project.swarmEnabled, 1));
    const activeProjectIds = activeProjects.map(p => p.id);

    const rows = await db.select().from(AgentTask).limit(50);
    const pending = rows.filter((r) => {
      if (!['pending', 'bug'].includes(r.status)) return false;
      if (!isAgentTargeted(r.agentId, agentIds)) return false;
      if (onlyProjectId != null) {
        if (r.projectId !== onlyProjectId) return false;
      }
      // Protection : on ne travaille que sur les projets activés (ou les tâches globales sans projet)
      if (r.projectId && !activeProjectIds.includes(r.projectId)) return false;
      return true;
    }).slice(0, 20);
    if (!pending.length) return;

    for (const task of pending) {
      try {
        const inputClean = stripForgeDoneFooterFromBody(task.input || '');
        const rawMessage = `[Forge — reprise automatique · tâche #${task.id}]\n\n${task.task}${inputClean ? '\n\n' + inputClean : ''}`;
        const translatedCore = await translateContentForAgent(rawMessage);
        const message = (
          translatedCore.trimEnd() +
          '\n\n' +
          buildForgeTaskDispatchFooter(task.id)
        ).slice(0, 120_000);

        const res = await runForgeAgentMessage({
          agentId: task.agentId,
          message,
          projectId: task.projectId,
          taskId: task.id,
          source: 'scheduler',
        });
        if (res.ok) {
          await insertForgeActivityLog({
            actorType: 'system',
            actorId: 'work_scheduler',
            action: 'swarm.task.executed',
            entityType: 'agent_task',
            entityId: String(task.id),
            details: {
              agentId: task.agentId,
              taskPreview: String(task.task || '').slice(0, 200),
            },
          });
        }
      } catch (err) {
        await insertForgeActivityLog({
          actorType: 'system',
          actorId: 'work_scheduler',
          action: 'swarm.task.dispatch_failed',
          entityType: 'agent_task',
          entityId: String(task.id),
          details: { error: String(err), agentId: task.agentId },
        });
      }
    }
  } catch (e) {
    console.warn('[work-scheduler] dispatchPendingTasks error:', e);
  }
}

/**
 * Dispatch une `AgentTask` en file (pending / bug) via l'orchestrateur Forge — même logique que le tick.
 * La tâche et l’assignation viennent de Forge ; l'exécution reste dans Forge.
 * Utilisé depuis la page Travail pour relancer une entrée sans attendre le prochain cycle.
 */
export async function dispatchSinglePendingTaskById(
  taskId: number,
  options?: { actorId?: string },
): Promise<{ ok: boolean; error?: string; task?: unknown }> {
  const { exceeded, info } = await checkBudgetExceeded();
  if (exceeded) return { ok: false, error: info };

  const { db, AgentTask, Project, eq } = await loadAstroDb();
  const [task] = await db.select().from(AgentTask).where(eq(AgentTask.id, taskId)).limit(1);
  if (!task) return { ok: false, error: 'Tâche introuvable' };

  const st = String(task.status || '').toLowerCase();
  if (!['pending', 'bug'].includes(st)) {
    return { ok: false, error: `La tâche n'est pas en file (statut : ${task.status}).` };
  }

  if (task.projectId != null) {
    const activeProjects = await db.select({ id: Project.id }).from(Project).where(eq(Project.swarmEnabled, 1));
    const activeProjectIds = new Set(activeProjects.map((p) => p.id));
    if (!activeProjectIds.has(task.projectId)) {
      return { ok: false, error: "Le projet de cette tâche n'a pas le swarm activé." };
    }
  }

  try {
    const inputClean = stripForgeDoneFooterFromBody(task.input || '');
    const rawMessage = `[Forge — reprise automatique · tâche #${task.id}]\n\n${task.task}${inputClean ? '\n\n' + inputClean : ''}`;
    const translatedCore = await translateContentForAgent(rawMessage);
    const message = (
      translatedCore.trimEnd() +
      '\n\n' +
      buildForgeTaskDispatchFooter(task.id)
    ).slice(0, 120_000);

    const actor = String(options?.actorId || '').trim().slice(0, 200) || 'dashboard';
    const res = await runForgeAgentMessage({
      agentId: task.agentId,
      message,
      projectId: task.projectId,
      taskId: task.id,
      actorId: actor,
      source: 'manual',
    });
    if (!res.ok) {
      return { ok: false, error: res.error || "Impossible d'exécuter la tâche via l'orchestrateur Forge." };
    }

    const { db: db2, AgentTask: AT2, eq: eq2 } = await loadAstroDb();
    await insertForgeActivityLog({
      actorType: 'user',
      actorId: actor,
      action: 'swarm.task.executed',
      entityType: 'agent_task',
      entityId: String(task.id),
      details: { manual: true, agentId: task.agentId },
    });
    const [updated] = await db2.select().from(AT2).where(eq2(AT2.id, task.id)).limit(1);
    return { ok: true, task: updated ?? task };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

async function getEnabledAgentIds(): Promise<string[]> {
  try {
    const { db, AgentInstruction } = await loadAstroDb();
    const allAgents = await db.select().from(AgentInstruction).where(eq(AgentInstruction.enabled, 1));
    return allAgents.map((a) => a.agentId);
  } catch {
    return [];
  }
}

/**
 * Agents concernés par les plages actives à `now` (vide dans les plages = tous les agents activés).
 */
async function resolveTargetsForScheduleWindow(
  activeSchedules: WorkScheduleRow[],
  now: Date,
): Promise<string[]> {
  const { db, AgentInstruction } = await loadAstroDb();
  const agentSet = new Set<string>();
  for (const s of activeSchedules) {
    if (isInWindow(s, now)) {
      try {
        const ids: string[] = JSON.parse(s.agentIds);
        ids.forEach((id) => {
          if (id) agentSet.add(id);
        });
      } catch {
        /* ignore */
      }
    }
  }
  let targets = [...agentSet];
  if (targets.length === 0) {
    const allAgents = await db.select().from(AgentInstruction).where(eq(AgentInstruction.enabled, 1));
    targets = allAgents.map((a) => a.agentId);
  }
  return targets;
}

/** Reprend les bugs → tâches et pousse les tâches pending (sans renvoyer la directive « début de session »). */
async function runDispatchOnly(agentIds: string[]): Promise<void> {
  if (sched().dispatchInProgress || sched().currentlyWorking) return;
  sched().dispatchInProgress = true;
  try {
    const { exceeded } = await checkBudgetExceeded();
    if (exceeded) return;
    await dispatchOpenAppIssues(agentIds);
    await dispatchPendingForgeRequests(agentIds);
    await dispatchPendingTasks(agentIds);
    await maybeEnqueueIdleDiscoveryTask(agentIds);
    await maybeCleanupIdleSubagents();
  } finally {
    sched().dispatchInProgress = false;
  }
}

async function maybeCleanupIdleSubagents(): Promise<void> {
  const now = Date.now();
  const everyMs = 6 * 60 * 60 * 1000;
  if (now - sched().lastSubagentCleanupAt < everyMs) return;
  sched().lastSubagentCleanupAt = now;
  try {
    const res = await cleanupIdleForgeProjectScopedAgents();
    if (res.removed.length > 0) {
      await logHeartbeat(
        'info',
        `[work-scheduler] cleanup sous-agents: ${res.removed.length} supprimé(s) sur ${res.scanned} scannés`,
      );
    }
  } catch (e) {
    console.warn('[work-scheduler] cleanup idle subagents error:', e);
  }
}

async function verifyAgentSessions(agentIds: string[]): Promise<{ active: string[]; missing: string[] }> {
  const targeted = [...new Set(agentIds.map((x) => String(x).trim()).filter(Boolean))];
  if (targeted.length === 0) return { active: [], missing: [] };
  try {
    const { db, AgentInstruction } = await loadAstroDb();
    const enabled = await db.select().from(AgentInstruction).where(eq(AgentInstruction.enabled, 1));
    const enabledIds = new Set(enabled.map((a) => normalizeAgentTarget(a.agentId)));
    const active = targeted.filter((id) => enabledIds.has(normalizeAgentTarget(id)));
    const missing = targeted.filter((id) => !active.includes(id));
    return { active, missing };
  } catch {
    return { active: [], missing: targeted };
  }
}

/** Exécute un texte de directive via l'orchestrateur Forge pour tous les agents cibles. */
async function deliverWorkDirectiveMessage(
  message: string,
  agentIds: string[],
): Promise<{
  errors: string[];
  awakened: string[];
  failed: { agentId: string; error: string }[];
}> {
  const errors: string[] = [];
  const awakened: string[] = [];
  const failed: { agentId: string; error: string }[] = [];
  const ordered = orderDirectiveTargets(
    agentIds.length ? agentIds : ['CHEF_TECHNIQUE'],
  );
  const MAX_ATTEMPTS = 3;
  for (const agentId of ordered) {
    let delivered = false;
    let lastError = 'échec inconnu';
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const res = await runForgeAgentMessage({
          agentId,
          message,
          source: 'work-directive',
        });
        if (res.ok) {
          delivered = true;
          awakened.push(agentId);
          if (attempt > 1) {
            await logHeartbeat(
              'info',
              `[work-scheduler] Directive ${agentId} réussie au retry ${attempt}/${MAX_ATTEMPTS}`,
            );
          }
          break;
        }
        lastError = res.error || lastError;
        if (attempt < MAX_ATTEMPTS) {
          await new Promise((resolve) => setTimeout(resolve, 250 * attempt));
        }
      }
      if (!delivered) {
        const line = `${agentId}: ${lastError}`;
        failed.push({ agentId, error: lastError });
        errors.push(line);
        await logHeartbeat('warn', `[work-scheduler] Directive non livrée après retries — ${line}`);
      }
    } catch (e) {
      const line = `${agentId}: ${String(e)}`;
      failed.push({ agentId, error: String(e) });
      errors.push(line);
      await logHeartbeat('warn', `[work-scheduler] Directive exception — ${line}`);
    }
  }
  return { errors, awakened, failed };
}

/** Envoie la directive de début de session à **tous** les agents cibles avec retries. */
async function sendWorkDirective(agentIds: string[]): Promise<{
  errors: string[];
  awakened: string[];
  failed: { agentId: string; error: string }[];
}> {
  const { db, Project } = await loadAstroDb();
  const activeProjects = await db.select().from(Project);
  const swarmProjects = activeProjects.filter((p) => p.swarmEnabled === 1);

  let projectListMsg = '';
  if (swarmProjects.length > 0) {
    const translatedPaths = await Promise.all(
      swarmProjects.map(async (p) => `- ${p.name} (${await toAgentPath(p.path)})`),
    );
    projectListMsg =
      '\n\n🎯 PROJETS ACTIFS POUR LE SWARM :\n' +
      translatedPaths.join('\n') +
      '\n\nInstructions prioritaires : le CHEF coordonne, la VEILLE propose des améliorations sur ces dépôts, les autres agents exécutent selon leurs rôles. Analyse les dossiers sur le NAS, identifie les manques et lance les tâches en attente.';
  } else {
    projectListMsg =
      '\n\n⚠️ AUCUN PROJET SWARM ACTIF (toggle par projet). La VEILLE peut quand même proposer des idées générales ; le CHEF garde la priorité sur ce qui est pertinent.';
  }

  const autonomy =
    '\n\n🛠️ OUTILS D’AUTONOMIE (à utiliser avec sobriété, max. 3 propositions matérialisées par cycle utile) :\n' +
    'Tu disposes notamment de `audit_project`, `propose_bug`, `propose_improvement`, `spawn_subagent` et `delegate_task`. ' +
    'Si la file est vide ou si tu détectes un problème en parcourant un dépôt, **utilise-les** pour alimenter le carnet d’anomalies et les idées — ' +
    'les quotas Forge limitent le spam.';

  const message =
    '[Forge — début de session de travail automatique]\n\n' +
    "Le système de travail Forge vient de démarrer une session. " +
    projectListMsg +
    autonomy;

  return deliverWorkDirectiveMessage(message, agentIds);
}

/** Directive ciblée sur un seul projet (tableau de bord : lancer le travail sur cette appli). */
async function sendWorkDirectiveForSingleProject(
  projectId: number,
  agentIds: string[],
): Promise<{
  errors: string[];
  awakened: string[];
  failed: { agentId: string; error: string }[];
}> {
  const { db, Project } = await loadAstroDb();
  const rows = await db.select().from(Project).where(eq(Project.id, projectId)).limit(1);
  const proj = rows[0];
  if (!proj || !proj.swarmEnabled) {
    return { errors: ['projet introuvable ou hors carnet'], awakened: [], failed: [] };
  }

  const pathLine = `- ${proj.name} (${await toAgentPath(proj.path)})`;
  const projectListMsg =
    '\n\n🎯 SESSION PRIORITAIRE — UN SEUL DÉPÔT :\n' +
    pathLine +
    '\n\nTraite en priorité les demandes carnet, bugs et tâches en attente pour ce dépôt.';

  const message =
    '[Forge — travail lancé pour une application]\n\n' +
    'Une session ciblée a été demandée depuis le tableau de bord Forge. ' +
    projectListMsg;

  return deliverWorkDirectiveMessage(message, agentIds);
}

async function checkBudgetExceeded(): Promise<{ exceeded: boolean; info: string }> {
  try {
    const { loadAstroDb } = await import('./load-astro-db');
    const { db, AgentBudget, CostEvent, sql } = await loadAstroDb();
    
    // On vérifie le budget global (somme de tous les budgets actifs)
    const budgets = await db.select().from(AgentBudget);
    const activeBudgets = budgets.filter(b => b.enabled === 1);
    
    // Calcul de la consommation mensuelle
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    
    const costs = await db.select({
      total: sql<number>`sum(${CostEvent.costCents})`,
    })
    .from(CostEvent)
    .where(sql`${CostEvent.occurredAt} >= ${startOfMonth}`);

    const currentMonthlyCents = Number(costs[0]?.total || 0);

    // Vérification Hard Stop globale (par défaut 5000 cents = 50€)
    const globalHardStopCents = activeBudgets.reduce((acc, b) => acc + Number(b.monthlyCents || 0), 0) || 5000;
    
    if (currentMonthlyCents >= globalHardStopCents) {
      return { 
        exceeded: true, 
        info: `Budget mensuel global atteint (${(currentMonthlyCents/100).toFixed(2)}€ / ${(globalHardStopCents/100).toFixed(2)}€)` 
      };
    }

    return { exceeded: false, info: `Consommation : ${(currentMonthlyCents/100).toFixed(2)}€` };
  } catch (e) {
    console.error('[work-scheduler] budget check failed:', e);
    return { exceeded: false, info: 'Erreur check budget — poursuite par sécurité' };
  }
}

/**
 * @param fromManual — true si déclenché par POST /api/work-system (manualStart) : on garde `sched().workState === 'running'`.
 *                     false si déclenché par la planification : après le cycle on repasse en `scheduled`
 *                     sinon le premier tick bloque tous les suivants (`tick` ignorait tout si `sched().workState === 'running'`).
 */
async function runWorkCycle(agentIds: string[], fromManual = false): Promise<WorkCycleResult> {
  if (sched().currentlyWorking) return { ok: false };

  const { exceeded, info } = await checkBudgetExceeded();
  if (exceeded) {
    await logHeartbeat('warn', `Cycle annulé : ${info}`);
    return { ok: false, budgetBlocked: info };
  }

  sched().currentlyWorking = true;
  sched().lastStartedAt = new Date();
  if (fromManual) {
    sched().workState = 'running';
  }

  try {
    const { db, ActivityLog } = await loadAstroDb();
    await logHeartbeat('info', `Cycle de travail démarré (${info})`);

    await db.insert(ActivityLog).values({
      actorType: 'system',
      actorId: 'scheduler',
      action: 'work_cycle.started',
      entityType: 'swarm',
      entityId: 'global',
      details: JSON.stringify({ agents: agentIds, budgetInfo: info }),
      createdAt: new Date(),
    });

    await syncGithubMonitorsForCurrentWorkSession({});

    const wake = await sendWorkDirective(agentIds);
    await dispatchOpenAppIssues(agentIds);
    await dispatchPendingForgeRequests(agentIds);
    await dispatchPendingTasks(agentIds);
    await maybeCleanupIdleSubagents();
    const sessionCheck = await verifyAgentSessions(agentIds);
    return {
      ok: true,
      forgeErrors: wake.errors,
      wakeReport: {
        targeted: [...new Set(agentIds.map((x) => String(x).trim()).filter(Boolean))].length,
        awakened: wake.awakened,
        failed: wake.failed,
        sessionCheck,
      },
    };
  } catch (e) {
    await logHeartbeat('error', `Erreur cycle de travail : ${String(e)}`);
    if (fromManual) {
      sched().workState = 'scheduled';
    }
    return { ok: false, error: String(e) };
  } finally {
    sched().currentlyWorking = false;
    if (!fromManual) {
      sched().workState = 'scheduled';
    }
  }
}

async function stopWorkCycle(reason: string) {
  sched().lastStoppedAt = new Date();
  sched().workState = 'stopped';
  await logHeartbeat('info', `Système de travail arrêté : ${reason}`);
}

/**
 * Alimente CI/PR → issues agents juste avant une directive de travail (pas sur chaque tick).
 */
async function syncGithubMonitorsForCurrentWorkSession(scope: GithubMonitoringScope) {
  if (sched().githubMonitoringInProgress) return;
  sched().githubMonitoringInProgress = true;
  try {
    const { syncGithubMonitorsForWorkSession } = await import('./forge-github-actions');
    await syncGithubMonitorsForWorkSession(scope);
  } catch (e) {
    if (stopSchedulerAfterViteClose('sync GitHub session', e)) return;
    console.error('[work-scheduler] sync GitHub session :', e);
  } finally {
    sched().githubMonitoringInProgress = false;
  }
}

/** Config `workSchedulerDispatchOutsideWindow` — défaut true (carnet / file traités hors plage). */
export async function readDispatchOutsideScheduledWindowEnabled(): Promise<boolean> {
  const raw = (await getConfig('workSchedulerDispatchOutsideWindow')).trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'no' || raw === 'off') return false;
  return true;
}

// ── Tick principal ────────────────────────────────────────────────────────────

async function tick() {
  if (sched().workState === 'stopped') return;

  // Mode manuel « En cours » : redispatch régulier (la directive complète a été envoyée au démarrage).
  if (sched().workState === 'running') {
    try {
      const agentIds = await getEnabledAgentIds();
      await runDispatchOnly(agentIds);
    } catch (e) {
      if (stopSchedulerAfterViteClose('tick running', e)) return;
      console.warn('[work-scheduler] tick (running) error:', e);
    }
    return;
  }

  if (sched().workState !== 'scheduled') return;

  try {
    const { db, WorkSchedule } = await loadAstroDb();
    const schedules: WorkScheduleRow[] = await db.select().from(WorkSchedule);
    const activeSchedules = schedules.filter((s) => s.enabled);

    const now = new Date();
    const inWindow = activeSchedules.some((s) => isInWindow(s, now));

    if (inWindow) {
      const targets = await resolveTargetsForScheduleWindow(activeSchedules, now);

      if (!sched().prevScheduledInWindow) {
        if (!sched().currentlyWorking) {
          const cycle = await runWorkCycle(targets, false);
          if (!cycle.budgetBlocked) {
            sched().prevScheduledInWindow = true;
          }
        }
      } else {
        await runDispatchOnly(targets);
      }
    } else {
      if (sched().prevScheduledInWindow) {
        await logHeartbeat('info', '[work-scheduler] Fin de plage horaire planifiée');
        sched().prevScheduledInWindow = false;
      }
      /**
       * Hors plage : pas de `runWorkCycle` (pas de directive « début de session »).
       * Si activé en Config : `runDispatchOnly` pour le carnet / la file (voir réglage planification).
       */
      if (await readDispatchOutsideScheduledWindowEnabled()) {
        try {
          const agentIds = await getEnabledAgentIds();
          await runDispatchOnly(agentIds);
        } catch (e) {
          if (stopSchedulerAfterViteClose('tick dispatch hors plage', e)) return;
          console.warn('[work-scheduler] tick (scheduled, hors plage) dispatch error:', e);
        }
      }
    }
  } catch (e) {
    if (stopSchedulerAfterViteClose('tick', e)) return;
    console.warn('[work-scheduler] tick error:', e);
  }
}

// ── API publique ──────────────────────────────────────────────────────────────

/** Démarrage le scheduler interne (idempotent). Appelé depuis le middleware au boot. */
export function startScheduler() {
  if (sched().intervalHandle) {
    console.log('[work-scheduler] already running');
    return;
  }
  
  console.log('[work-scheduler] starting interval loop...');
  sched().intervalHandle = setInterval(async () => {
    try {
      await tick();
    } catch (e: any) {
      if (stopSchedulerAfterViteClose('critical tick', e)) return;
      console.error('[work-scheduler] CRITICAL TICK ERROR:', e.message);
    }
  }, 60_000);

  // Premier tick dans 5 s pour ne pas bloquer le démarrage
  sched().initialTickHandle = setTimeout(async () => {
    sched().initialTickHandle = null;
    console.log('[work-scheduler] performing initial tick...');
    try {
      await tick();
    } catch (e: any) {
      if (stopSchedulerAfterViteClose('initial tick', e)) return;
      console.error('[work-scheduler] initial tick failed:', e.message);
    }
  }, 5_000);
}

/** Arrête l'interval (ex. en test). */
export function stopScheduler() {
  const init = sched().initialTickHandle;
  if (init) {
    clearTimeout(init);
    sched().initialTickHandle = null;
  }
  const iv = sched().intervalHandle;
  if (iv) {
    clearInterval(iv);
    sched().intervalHandle = null;
  }
}

(import.meta as ImportMeta & { hot?: { dispose: (callback: () => void) => void } }).hot?.dispose(() => {
  stopScheduler();
});

/**
 * Cycle de travail **ciblé sur un projet** (depuis le tableau de bord).
 * Ne modifie pas l’état global du scheduler (`running` / `planifié`) : pulse immédiat
 * (directive + dispatch bugs / demandes / tâches pour ce seul `projectId`).
 */
export async function runProjectWorkBurst(projectId: number): Promise<WorkCycleResult> {
  if (sched().currentlyWorking) {
    return { ok: false, error: 'Un cycle de travail est déjà en cours. Réessayez dans quelques instants.' };
  }

  const { db, Project, ActivityLog } = await loadAstroDb();
  const rows = await db.select().from(Project).where(eq(Project.id, projectId)).limit(1);
  const proj = rows[0];
  if (!proj) {
    return { ok: false, error: 'Projet introuvable.' };
  }
  if (!proj.swarmEnabled) {
    return { ok: false, error: 'Inscrivez d’abord ce projet au carnet (icône sur la carte), puis relancez.' };
  }

  const { exceeded, info } = await checkBudgetExceeded();
  if (exceeded) {
    await logHeartbeat('warn', `Cycle projet #${projectId} annulé : ${info}`);
    return { ok: false, budgetBlocked: info };
  }

  sched().currentlyWorking = true;
  try {
    const agentIds = await getEnabledAgentIds();
    await logHeartbeat('info', `Cycle ciblé « ${proj.name} » (#${projectId}) — ${info}`);

    await db.insert(ActivityLog).values({
      actorType: 'system',
      actorId: 'scheduler',
      action: 'work_cycle.project_burst.started',
      entityType: 'project',
      entityId: String(projectId),
      details: JSON.stringify({ projectName: proj.name, agents: agentIds, budgetInfo: info }),
      createdAt: new Date(),
    });

    await syncGithubMonitorsForCurrentWorkSession({ projectId });

    const wake = await sendWorkDirectiveForSingleProject(projectId, agentIds);
    await dispatchOpenAppIssues(agentIds, projectId);
    await dispatchPendingForgeRequests(agentIds, projectId);
    await dispatchPendingTasks(agentIds, projectId);
    await maybeCleanupIdleSubagents();
    const sessionCheck = await verifyAgentSessions(agentIds);
    return {
      ok: true,
      forgeErrors: wake.errors,
      wakeReport: {
        targeted: [...new Set(agentIds.map((x) => String(x).trim()).filter(Boolean))].length,
        awakened: wake.awakened,
        failed: wake.failed,
        sessionCheck,
      },
    };
  } catch (e) {
    await logHeartbeat('error', `Erreur cycle projet #${projectId} : ${String(e)}`);
    return { ok: false, error: String(e) };
  } finally {
    sched().currentlyWorking = false;
  }
}

/** Démarrage manuel — le système passe en `running` seulement après contrôle budget (voir `runWorkCycle`). */
export async function manualStart(agentIds: string[] = []): Promise<WorkCycleResult> {
  let targets = agentIds;

  if (targets.length === 0) {
    const { loadAstroDb } = await import('./load-astro-db');
    const { db, AgentInstruction } = await loadAstroDb();
    const allAgents = await db.select().from(AgentInstruction).where(eq(AgentInstruction.enabled, 1));
    targets = allAgents.map((a) => a.agentId);
  }

  return await runWorkCycle(targets, true);
}

/**
 * Déclenche un redispatch immédiat (sans envoyer la directive "début de session").
 * Utile après création d'une demande carnet pour éviter d'attendre le prochain tick.
 */
export async function triggerDispatchNow(agentIds: string[] = []): Promise<void> {
  const targets = agentIds.length ? agentIds : await getEnabledAgentIds();
  await runDispatchOnly(targets);
}

/** Arrêt manuel — repasse en mode `stopped` (les plages planifiées ne reprennent pas). */
export async function manualStop() {
  await stopWorkCycle('arrêt manuel');
  sched().workState = 'stopped';
  sched().prevScheduledInWindow = false;
}

/** Réactive le mode planifié — le scheduler reprend le contrôle. */
export function enableScheduledMode() {
  sched().workState = 'scheduled';
  sched().currentlyWorking = false;
  sched().prevScheduledInWindow = false;
}

/** Retourne l'état courant du système de travail. */
export async function getWorkSystemStatus(): Promise<WorkSystemStatus> {
  let schedules: WorkScheduleRow[] = [];
  try {
    const { db, WorkSchedule, eq } = await loadAstroDb();
    schedules = await db.select().from(WorkSchedule).where(eq(WorkSchedule.enabled, 1));
  } catch {
    /* DB indisponible */
  }

  const now = new Date();
  const inWindow = schedules.some((s) => isInWindow(s, now));
  const nextWindowAt = computeNextWindowAt(schedules);
  const dispatchOutsideScheduledWindow = await readDispatchOutsideScheduledWindowEnabled();

  return {
    state: sched().workState,
    schedulerActive: sched().intervalHandle !== null,
    lastStartedAt: sched().lastStartedAt,
    lastStoppedAt: sched().lastStoppedAt,
    inScheduledWindow: inWindow,
    nextWindowAt,
    dispatchOutsideScheduledWindow,
  };
}
