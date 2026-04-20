/**
 * Scheduler de travail du swarm Forge.
 *
 * - Tourne en arrière-plan via setInterval (60 s).
 * - Lit les WorkSchedule actifs en DB pour décider si la plage horaire est valide.
 * - Peut être démarré / arrêté manuellement (override = ignore les plages).
 * - Quand le travail commence : envoie une directive au CHEF_TECHNIQUE via OpenClaw
 *   et redispatche les AgentTask en statut `pending` / `bug`.
 * - Journalise dans la table Heartbeat.
 */

import { eq } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { toAgentPath, translateContentForAgent } from './forge-repos';
import { invokeOpenClawSessionsSend, resolveSessionsSendKey } from './openclaw-gateway';

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

/** Retour de `runWorkCycle` / `manualStart` pour affichage API (OpenClaw, budget). */
export type WorkCycleResult = {
  ok: boolean;
  budgetBlocked?: string;
  openClawErrors?: string[];
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
      if (seenIssueIds.has(idStr)) continue;

      const assignee = String(issue.assigneeAgentId || 'CHEF_TECHNIQUE').trim() || 'CHEF_TECHNIQUE';
      if (agentIds.length && !agentIds.includes(assignee)) continue;

      const taskTitle = `[AppIssue #${issue.id}] ${issue.title}`;
      const taskInput = [
        `URL: ${issue.url}`,
        `Type: ${issue.errorType}`,
        issue.detail ? `Détail: ${issue.detail}` : '',
        `Rapporté par: ${issue.reportedByAgentId}`,
      ]
        .filter(Boolean)
        .join('\n');

      await db.insert(AgentTask).values({
        agentId: assignee,
        task: taskTitle,
        input: taskInput,
        projectId: issue.projectId ?? undefined,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      seenIssueIds.add(idStr);
    }
  } catch (e) {
    console.warn('[work-scheduler] dispatchOpenAppIssues error:', e);
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
      if (agentIds.length && !agentIds.includes(r.agentId)) return false;
      // Protection : on ne travaille que sur les projets activés (ou les tâches globales sans projet)
      if (r.projectId && !activeProjectIds.includes(r.projectId)) return false;
      return true;
    }).slice(0, 20);
    if (!pending.length) return;

    for (const task of pending) {
      try {
        const sessionKey = task.agentId;
        const rawMessage = `[Forge — reprise automatique · tâche #${task.id}]\n\n${task.task}${task.input ? '\n\n' + task.input : ''}`;
        const message = (await translateContentForAgent(rawMessage)).slice(0, 120_000);

        let res = await invokeOpenClawSessionsSend({ sessionKey, message, asyncDelivery: true });
        if (!res.ok) {
          const fallback = await resolveSessionsSendKey(undefined, [sessionKey, task.agentId]);
          if (fallback && fallback !== sessionKey) {
            res = await invokeOpenClawSessionsSend({ sessionKey: fallback, message, asyncDelivery: true });
          }
        }
        if (res.ok) {
          const { db: db2, AgentTask: AT2, eq: eq2 } = await loadAstroDb();
          await db2.update(AT2).set({ status: 'running', updatedAt: new Date() }).where(eq2(AT2.id, task.id));
        }
      } catch {
        /* task skip silencieux */
      }
    }
  } catch (e) {
    console.warn('[work-scheduler] dispatchPendingTasks error:', e);
  }
}

/** Envoie la directive de début de session ; renvoie les erreurs OpenClaw (token, gateway, session). */
async function sendWorkDirective(agentIds: string[]): Promise<string[]> {
  const errors: string[] = [];
  const { db, Project } = await loadAstroDb();
  const activeProjects = await db.select().from(Project);
  const swarmProjects = activeProjects.filter(p => p.swarmEnabled === 1);

  const targets = agentIds.length ? agentIds : ['CHEF_TECHNIQUE'];

  let projectListMsg = '';
  if (swarmProjects.length > 0) {
    const translatedPaths = await Promise.all(
      swarmProjects.map(async (p) => `- ${p.name} (${await toAgentPath(p.path)})`),
    );
    projectListMsg =
      '\n\n🎯 PROJETS ACTIFS POUR LE SWARM :\n' +
      translatedPaths.join('\n') +
      '\n\nInstructions prioritaires : Analyse ces dossiers sur le NAS, identifie les manques et propose des améliorations ou commence les tâches en attente.';
  } else {
    projectListMsg =
      '\n\n⚠️ AUCUN PROJET ACTIF. Reste en veille et surveille les nouvelles instructions générales.';
  }

  const message =
    '[Forge — début de session de travail automatique]\n\n' +
    "Le système de travail planifié vient de s'activer. " +
    projectListMsg;

  for (const sessionKey of targets.slice(0, 3)) {
    try {
      const res = await invokeOpenClawSessionsSend({ sessionKey, message, asyncDelivery: true });
      if (!res.ok) {
        const line = `${sessionKey}: ${res.error || 'échec inconnu'}`;
        errors.push(line);
        await logHeartbeat('warn', `[work-scheduler] Directive non livrée — ${line}`);
      }
    } catch (e) {
      const line = `${sessionKey}: ${String(e)}`;
      errors.push(line);
      await logHeartbeat('warn', `[work-scheduler] Directive exception — ${line}`);
    }
  }
  return errors;
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

    const openClawErrors = await sendWorkDirective(agentIds);
    /** Crée des AgentTask pour les bugs ouverts, puis envoie toutes les tâches `pending`/`bug`. */
    await dispatchOpenAppIssues(agentIds);
    await dispatchPendingTasks(agentIds);
    return { ok: true, openClawErrors };
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
  if (_state === 'running' || _state === 'stopped') {
    // override manuel : on ne touche pas à l'état
    return;
  }

  // Mode 'scheduled' : évaluer les plages horaires
  try {
    const { db, WorkSchedule } = await loadAstroDb();
    const schedules: WorkScheduleRow[] = await db.select().from(WorkSchedule);
    const activeSchedules = schedules.filter((s) => s.enabled);

    const now = new Date();
    const inWindow = activeSchedules.some((s) => isInWindow(s, now));

    if (inWindow && !_currentlyWorking) {
      // Rassembler tous les agentIds des plages actives dans la fenêtre
      const agentSet = new Set<string>();
      for (const s of activeSchedules) {
        if (isInWindow(s, now)) {
          try {
            const ids: string[] = JSON.parse(s.agentIds);
            ids.forEach((id) => { if (id) agentSet.add(id); });
          } catch {
            /* ignore */
          }
        }
      }

      let targets = [...agentSet];
      // Si la plage ne spécifie aucun agent, on prend tous les agents activés
      if (targets.length === 0) {
        const { AgentInstruction } = await loadAstroDb();
        const allAgents = await db.select().from(AgentInstruction).where(eq(AgentInstruction.enabled, 1));
        targets = allAgents.map(a => a.agentId);
      }

      await runWorkCycle(targets, false);
    } else if (!inWindow && _currentlyWorking) {
      await stopWorkCycle('fin de plage horaire');
    }
  } catch (e) {
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
      console.error('[work-scheduler] CRITICAL TICK ERROR:', e.message);
    }
  }, 60_000);

  // Premier tick dans 5 s pour ne pas bloquer le démarrage
  setTimeout(async () => {
    console.log('[work-scheduler] performing initial tick...');
    try {
      await tick();
    } catch (e: any) {
      console.error('[work-scheduler] initial tick failed:', e.message);
    }
  }, 5_000);
}

/** Arrête l'interval (ex. en test). */
export function stopScheduler() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
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

/** Arrêt manuel — repasse en mode `stopped` (les plages planifiées ne reprennent pas). */
export async function manualStop() {
  await stopWorkCycle('arrêt manuel');
  _state = 'stopped';
}

/** Réactive le mode planifié — le scheduler reprend le contrôle. */
export function enableScheduledMode() {
  _state = 'scheduled';
  _currentlyWorking = false;
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
