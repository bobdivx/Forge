/**
 * Scheduler de travail du swarm Forge.
 *
 * - Tourne en arrière-plan via setInterval (60 s).
 * - Lit les WorkSchedule actifs en DB pour décider si la plage horaire est valide.
 * - Peut être démarré / arrêté manuellement (override = ignore les plages).
 * - Au début d’une session (manuel ou entrée dans une plage) : directive à tous les agents
 *   concernés via ZimaOS, puis création de tâches depuis les bugs ouverts et envoi des
 *   AgentTask `pending` / `bug`.
 * - Pendant la session : redispatch périodique des tâches sans renvoyer la directive complète.
 * - Les demandes carnet (`Request` en pending) sont converties en `AgentTask` liées par `[ForgeRequest #id]`.
 * - Journalise dans la table Heartbeat.
 */

import { eq } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { toAgentPath, translateContentForAgent } from './forge-repos';
import {
  invokeZimaOSSessionsSend,
  resolveSessionsSendKey,
  fetchZimaOSSessionsPayload,
  normalizeZimaOSSessions,
} from './zimaos-gateway';
import {
  resolveAssigneeForForgeRequest,
  forgeRequestTaskTitle,
  extractForgeRequestIdFromTaskBlob,
  appendForgeDoneFooterToTaskBody,
  buildForgeTaskDispatchFooter,
  stripForgeDoneFooterFromBody,
} from './forge-request-routing';
import { scanZimaOSForForgeDoneSignals } from './forge-zimaos-done-scan';
import { insertForgeActivityLog } from './forge-activity-log';
import { ensureProjectScopedSubagent } from './zimaos-app-subagents';
import { checkGithubActionsForProjects } from './forge-github-actions';
import { cleanupIdleProjectScopedSubagents } from './zimaos-app-subagents';

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
};

/** Retour de `runWorkCycle` / `manualStart` pour affichage API (ZimaOS, budget). */
export type WorkCycleResult = {
  ok: boolean;
  budgetBlocked?: string;
  zimaosErrors?: string[];
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

// ── État interne (singleton) ──────────────────────────────────────────────────

let _intervalHandle: ReturnType<typeof setInterval> | null = null;
let _state: WorkSystemState = 'scheduled';
let _lastStartedAt: Date | null = null;
let _lastStoppedAt: Date | null = null;
let _currentlyWorking = false;
/** Évite les exécutions concurrentes du redispatch léger. */
let _dispatchInProgress = false;
let _lastSubagentCleanupAt = 0;
/** Pour le mode planifié : évite une directive « début de session » à chaque minute dans la plage. */
let _prevScheduledInWindow = false;
let _initialTickHandle: ReturnType<typeof setTimeout> | null = null;

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
  return String(id || '').trim().replace(/^zimaos\//i, '').toUpperCase();
}

function isAgentTargeted(agentId: string, targetIds: string[]): boolean {
  if (!targetIds.length) return true;
  const agent = normalizeAgentTarget(agentId);
  return targetIds.some((targetId) => {
    const target = normalizeAgentTarget(targetId);
    return agent === target || agent.startsWith(`${target}__APP_`);
  });
}

/** Envoie `sessions_send` puis tente la résolution de clé gateway (ids métiers / alias). */
async function sessionsSendWithFallback(
  sessionKey: string,
  message: string,
  extraHints: string[] = [],
): Promise<{ ok: boolean; error?: string }> {
  let res = await invokeZimaOSSessionsSend({ sessionKey, message, asyncDelivery: true });
  if (!res.ok) {
    const fallback = await resolveSessionsSendKey(undefined, [
      sessionKey,
      sessionKey.replace(/^zimaos\//i, ''),
      ...extraHints,
    ]);
    if (fallback && fallback !== sessionKey) {
      res = await invokeZimaOSSessionsSend({ sessionKey: fallback, message, asyncDelivery: true });
    }
  }
  return res.ok ? { ok: true } : { ok: false, error: res.error };
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
async function dispatchOpenAppIssues(agentIds: string[]) {
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
      if (issue.projectId != null && !activeIds.has(issue.projectId)) continue;
      const idStr = String(issue.id);

      const parentAssignee = String(issue.assigneeAgentId || 'CHEF_TECHNIQUE').trim() || 'CHEF_TECHNIQUE';
      const scoped = await ensureProjectScopedSubagent({
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
  }
}

/** Demandes carnet (`Request` pending) → `AgentTask`, puis passage en `in_progress`. */
async function dispatchPendingForgeRequests(agentIds: string[]) {
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
      if (!activeIds.has(req.projectId)) continue;

      const parentAssignee = resolveAssigneeForForgeRequest(req);
      const scoped = await ensureProjectScopedSubagent({
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

async function dispatchPendingTasks(agentIds: string[]) {
  try {
    const { db, AgentTask, Project } = await loadAstroDb();

    // Récupération des projets activés pour le filtrage
    const activeProjects = await db.select({ id: Project.id }).from(Project).where(eq(Project.swarmEnabled, 1));
    const activeProjectIds = activeProjects.map(p => p.id);

    const rows = await db.select().from(AgentTask).limit(50);
    const pending = rows.filter((r) => {
      if (!['pending', 'bug'].includes(r.status)) return false;
      if (!isAgentTargeted(r.agentId, agentIds)) return false;
      // Protection : on ne travaille que sur les projets activés (ou les tâches globales sans projet)
      if (r.projectId && !activeProjectIds.includes(r.projectId)) return false;
      return true;
    }).slice(0, 20);
    if (!pending.length) return;

    for (const task of pending) {
      try {
        const sessionKey = task.agentId;
        const inputClean = stripForgeDoneFooterFromBody(task.input || '');
        const rawMessage = `[Forge — reprise automatique · tâche #${task.id}]\n\n${task.task}${inputClean ? '\n\n' + inputClean : ''}`;
        const translatedCore = await translateContentForAgent(rawMessage);
        const message = (
          translatedCore.trimEnd() +
          '\n\n' +
          buildForgeTaskDispatchFooter(task.id)
        ).slice(0, 120_000);

        const res = await sessionsSendWithFallback(sessionKey, message, [
          task.agentId,
          String(task.agentId || '').replace(/^zimaos\//i, ''),
        ]);
        if (res.ok) {
          const { db: db2, AgentTask: AT2, eq: eq2 } = await loadAstroDb();
          await db2.update(AT2).set({ status: 'running', updatedAt: new Date() }).where(eq2(AT2.id, task.id));
          await insertForgeActivityLog({
            actorType: 'system',
            actorId: 'work_scheduler',
            action: 'swarm.task.sent_zimaos',
            entityType: 'agent_task',
            entityId: String(task.id),
            details: {
              sessionKey,
              taskPreview: String(task.task || '').slice(0, 200),
            },
          });
        }
      } catch {
        /* task skip silencieux */
      }
    }
  } catch (e) {
    console.warn('[work-scheduler] dispatchPendingTasks error:', e);
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
  if (_dispatchInProgress || _currentlyWorking) return;
  _dispatchInProgress = true;
  try {
    const { exceeded } = await checkBudgetExceeded();
    if (exceeded) return;
    await dispatchOpenAppIssues(agentIds);
    await dispatchPendingForgeRequests(agentIds);
    await dispatchPendingTasks(agentIds);
    await scanZimaOSForForgeDoneSignals();
    await maybeCleanupIdleSubagents();
  } finally {
    _dispatchInProgress = false;
  }
}

async function maybeCleanupIdleSubagents(): Promise<void> {
  const now = Date.now();
  const everyMs = 6 * 60 * 60 * 1000;
  if (now - _lastSubagentCleanupAt < everyMs) return;
  _lastSubagentCleanupAt = now;
  try {
    const res = await cleanupIdleProjectScopedSubagents();
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
    const payload = await fetchZimaOSSessionsPayload(undefined, {
      invokeOnly: true,
      sessionsListArgs: { limit: 120, messageLimit: 0 },
    });
    if (!payload.ok) {
      return { active: [], missing: targeted };
    }
    const sessions = normalizeZimaOSSessions(payload.data) as Record<string, unknown>[];
    const isActive = (agentId: string) => {
      const want = agentId.trim().toUpperCase();
      return sessions.some((s) => {
        const keys = [
          String(s.agentId ?? '').trim().toUpperCase(),
          String(s.agent_id ?? '').trim().toUpperCase(),
          String(s.sessionKey ?? '').trim().toUpperCase(),
          String(s.session_key ?? '').trim().toUpperCase(),
          String(s.key ?? '').trim().toUpperCase(),
          String(s.displayName ?? '').trim().toUpperCase(),
          String(s.display_name ?? '').trim().toUpperCase(),
        ];
        const status = String(s.status ?? s.state ?? '').trim().toLowerCase();
        const stateActive =
          status === 'running' ||
          status === 'active' ||
          status === 'connected' ||
          status === 'online';
        return stateActive && keys.some((k) => k === want || (k && k.includes(want)));
      });
    };
    const active = targeted.filter((id) => isActive(id));
    const missing = targeted.filter((id) => !active.includes(id));
    return { active, missing };
  } catch {
    return { active: [], missing: targeted };
  }
}

/** Envoie la directive de début de session à **tous** les agents cibles avec retries. */
async function sendWorkDirective(agentIds: string[]): Promise<{
  errors: string[];
  awakened: string[];
  failed: { agentId: string; error: string }[];
}> {
  const errors: string[] = [];
  const awakened: string[] = [];
  const failed: { agentId: string; error: string }[] = [];
  const { db, Project } = await loadAstroDb();
  const activeProjects = await db.select().from(Project);
  const swarmProjects = activeProjects.filter((p) => p.swarmEnabled === 1);

  const ordered = orderDirectiveTargets(
    agentIds.length ? agentIds : ['CHEF_TECHNIQUE'],
  );

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

  const message =
    '[Forge — début de session de travail automatique]\n\n' +
    "Le système de travail Forge vient de démarrer une session. " +
    projectListMsg;

  const MAX_ATTEMPTS = 3;
  for (const sessionKey of ordered) {
    let delivered = false;
    let lastError = 'échec inconnu';
    try {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const res = await sessionsSendWithFallback(sessionKey, message, [sessionKey]);
        if (res.ok) {
          delivered = true;
          awakened.push(sessionKey);
          if (attempt > 1) {
            await logHeartbeat(
              'info',
              `[work-scheduler] Réveil ${sessionKey} réussi au retry ${attempt}/${MAX_ATTEMPTS}`,
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
        const line = `${sessionKey}: ${lastError}`;
        failed.push({ agentId: sessionKey, error: lastError });
        errors.push(line);
        await logHeartbeat('warn', `[work-scheduler] Directive non livrée après retries — ${line}`);
      }
    } catch (e) {
      const line = `${sessionKey}: ${String(e)}`;
      failed.push({ agentId: sessionKey, error: String(e) });
      errors.push(line);
      await logHeartbeat('warn', `[work-scheduler] Directive exception — ${line}`);
    }
  }
  return { errors, awakened, failed };
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
 * @param fromManual — true si déclenché par POST /api/work-system (manualStart) : on garde `_state === 'running'`.
 *                     false si déclenché par la planification : après le cycle on repasse en `scheduled`
 *                     sinon le premier tick bloque tous les suivants (`tick` ignorait tout si `_state === 'running'`).
 */
async function runWorkCycle(agentIds: string[], fromManual = false): Promise<WorkCycleResult> {
  if (_currentlyWorking) return { ok: false };

  const { exceeded, info } = await checkBudgetExceeded();
  if (exceeded) {
    await logHeartbeat('warn', `Cycle annulé : ${info}`);
    return { ok: false, budgetBlocked: info };
  }

  _currentlyWorking = true;
  _lastStartedAt = new Date();
  if (fromManual) {
    _state = 'running';
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

    const wake = await sendWorkDirective(agentIds);
    await dispatchOpenAppIssues(agentIds);
    await dispatchPendingForgeRequests(agentIds);
    await dispatchPendingTasks(agentIds);
    await scanZimaOSForForgeDoneSignals();
    await maybeCleanupIdleSubagents();
    const sessionCheck = await verifyAgentSessions(agentIds);
    return {
      ok: true,
      zimaosErrors: wake.errors,
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
      _state = 'scheduled';
    }
    return { ok: false, error: String(e) };
  } finally {
    _currentlyWorking = false;
    if (!fromManual) {
      _state = 'scheduled';
    }
  }
}

async function stopWorkCycle(reason: string) {
  _lastStoppedAt = new Date();
  _state = 'stopped';
  await logHeartbeat('info', `Système de travail arrêté : ${reason}`);
}

// ── Tick principal ────────────────────────────────────────────────────────────

async function tick() {
  if (_state === 'stopped') return;

  // Background monitorings
  try {
    await checkGithubActionsForProjects();
  } catch (e) {
    if (stopSchedulerAfterViteClose('github monitoring', e)) return;
    console.error('[work-scheduler] github monitoring error:', e);
  }

  // Mode manuel « En cours » : redispatch régulier (la directive complète a été envoyée au démarrage).
  if (_state === 'running') {
    try {
      const agentIds = await getEnabledAgentIds();
      await runDispatchOnly(agentIds);
    } catch (e) {
      if (stopSchedulerAfterViteClose('tick running', e)) return;
      console.warn('[work-scheduler] tick (running) error:', e);
    }
    return;
  }

  if (_state !== 'scheduled') return;

  try {
    const { db, WorkSchedule } = await loadAstroDb();
    const schedules: WorkScheduleRow[] = await db.select().from(WorkSchedule);
    const activeSchedules = schedules.filter((s) => s.enabled);

    const now = new Date();
    const inWindow = activeSchedules.some((s) => isInWindow(s, now));

    if (inWindow) {
      const targets = await resolveTargetsForScheduleWindow(activeSchedules, now);

      if (!_prevScheduledInWindow) {
        if (!_currentlyWorking) {
          const cycle = await runWorkCycle(targets, false);
          if (!cycle.budgetBlocked) {
            _prevScheduledInWindow = true;
          }
        }
      } else {
        await runDispatchOnly(targets);
      }
    } else {
      if (_prevScheduledInWindow) {
        await logHeartbeat('info', '[work-scheduler] Fin de plage horaire planifiée');
        _prevScheduledInWindow = false;
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
  if (_intervalHandle) {
    console.log('[work-scheduler] already running');
    return;
  }
  
  console.log('[work-scheduler] starting interval loop...');
  _intervalHandle = setInterval(async () => {
    try {
      await tick();
    } catch (e: any) {
      if (stopSchedulerAfterViteClose('critical tick', e)) return;
      console.error('[work-scheduler] CRITICAL TICK ERROR:', e.message);
    }
  }, 60_000);

  // Premier tick dans 5 s pour ne pas bloquer le démarrage
  _initialTickHandle = setTimeout(async () => {
    _initialTickHandle = null;
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
  if (_initialTickHandle) {
    clearTimeout(_initialTickHandle);
    _initialTickHandle = null;
  }
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
}

(import.meta as ImportMeta & { hot?: { dispose: (callback: () => void) => void } }).hot?.dispose(() => {
  stopScheduler();
});

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
  _state = 'stopped';
  _prevScheduledInWindow = false;
}

/** Réactive le mode planifié — le scheduler reprend le contrôle. */
export function enableScheduledMode() {
  _state = 'scheduled';
  _currentlyWorking = false;
  _prevScheduledInWindow = false;
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

  return {
    state: _state,
    schedulerActive: _intervalHandle !== null,
    lastStartedAt: _lastStartedAt,
    lastStoppedAt: _lastStoppedAt,
    inScheduledWindow: inWindow,
    nextWindowAt,
  };
}
