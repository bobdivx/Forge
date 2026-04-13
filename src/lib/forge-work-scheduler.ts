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

import { loadAstroDb } from './load-astro-db';
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
    const { db, Heartbeat } = await loadAstroDb();
    await db.insert(Heartbeat).values({ level, message, source: 'WORK_SCHEDULER' });
  } catch {
    console.warn('[work-scheduler] log failed:', message);
  }
}

// ── Cycle de travail ──────────────────────────────────────────────────────────

async function dispatchPendingTasks(agentIds: string[]) {
  try {
    const { db, AgentTask } = await loadAstroDb();

    const rows = await db.select().from(AgentTask).limit(50);
    const pending = rows.filter((r) => {
      if (!['pending', 'bug'].includes(r.status)) return false;
      if (agentIds.length && !agentIds.includes(r.agentId)) return false;
      return true;
    }).slice(0, 20);
    if (!pending.length) return;

    for (const task of pending) {
      try {
        const sessionKey = task.agentId;
        const message = `[Forge — reprise automatique · tâche #${task.id}]\n\n${task.task}${task.input ? '\n\n' + task.input : ''}`.slice(0, 120_000);

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

async function sendWorkDirective(agentIds: string[]) {
  const targets = agentIds.length ? agentIds : ['CHEF_TECHNIQUE'];
  const message =
    '[Forge — début de session de travail automatique]\n\n' +
    "Le système de travail planifié vient de s'activer. " +
    'Consulte la liste des tâches en attente via ton accès à /api/agent-tasks et commence à travailler selon les priorités.';

  for (const sessionKey of targets.slice(0, 3)) {
    try {
      await invokeOpenClawSessionsSend({ sessionKey, message, asyncDelivery: true });
    } catch {
      /* silencieux */
    }
  }
}

async function runWorkCycle(agentIds: string[]) {
  if (_currentlyWorking) return;
  _currentlyWorking = true;
  _lastStartedAt = new Date();
  _state = 'running';

  try {
    await logHeartbeat('info', 'Cycle de travail démarré (scheduler)');
    await sendWorkDirective(agentIds);
    await dispatchPendingTasks(agentIds);
  } catch (e) {
    await logHeartbeat('error', `Erreur cycle de travail : ${String(e)}`);
  } finally {
    _currentlyWorking = false;
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
            ids.forEach((id) => agentSet.add(id));
          } catch {
            /* ignore */
          }
        }
      }
      await runWorkCycle([...agentSet]);
    } else if (!inWindow && _currentlyWorking) {
      await stopWorkCycle('fin de plage horaire');
    }
  } catch (e) {
    console.warn('[work-scheduler] tick error:', e);
  }
}

// ── API publique ──────────────────────────────────────────────────────────────

/** Démarre le scheduler interne (idempotent). Appelé depuis le middleware au boot. */
export function startScheduler() {
  if (_intervalHandle) return;
  _intervalHandle = setInterval(() => {
    tick().catch((e) => console.warn('[work-scheduler] tick unhandled:', e));
  }, 60_000);
  // Premier tick dans 5 s pour ne pas bloquer le démarrage
  setTimeout(() => {
    tick().catch(() => undefined);
  }, 5_000);
}

/** Arrête l'interval (ex. en test). */
export function stopScheduler() {
  if (_intervalHandle) {
    clearInterval(_intervalHandle);
    _intervalHandle = null;
  }
}

/** Démarrage manuel — le système reste `running` jusqu'à un arrêt manuel ou fin de session. */
export async function manualStart(agentIds: string[] = []) {
  _state = 'running';
  await runWorkCycle(agentIds);
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
