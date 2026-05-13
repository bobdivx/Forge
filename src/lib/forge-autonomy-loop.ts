/**
 * Forge Autonomy Loop — super-orchestrateur des daemons Forge.
 *
 * Démarre, supervise et redémarre :
 *  - le scheduler de travail (`forge-work-scheduler`)
 *  - le bug detector (`forge-bug-detector`)
 *  - le watcher GitHub (`forge-github-watcher`)
 *  - la veille tech (`forge-tech-watch`)
 *
 * Gère trois modes :
 *  - `on`           : tous les daemons tournent en continu (24/7)
 *  - `off`          : tous les daemons sont arrêtés
 *  - `quiet_hours`  : les daemons d'analyse continuent, mais le dispatch
 *                     du scheduler est inhibé dans la plage horaire configurée.
 */
import { getConfig, setConfig } from './config-db';
import { startScheduler, stopScheduler } from './forge-work-scheduler';
import { startBugDetector, stopBugDetector, getBugDetectorStatus } from './forge-bug-detector';
import { startGithubWatcher, stopGithubWatcher, getGithubWatcherStatus } from './forge-github-watcher';
import { startTechWatch, stopTechWatch, getTechWatchStatus } from './forge-tech-watch';
import { insertForgeActivityLog } from './forge-activity-log';

export type AutonomyMode = 'on' | 'off' | 'quiet_hours';

export type SubDaemonHealth = {
  name: 'scheduler' | 'bug_detector' | 'github_watcher' | 'tech_watch';
  running: boolean;
  lastError: string | null;
  lastTickAt: string | null;
};

export type AutonomyStatus = {
  mode: AutonomyMode;
  quietHours: string;
  inQuietHours: boolean;
  subDaemons: SubDaemonHealth[];
  bootedAt: string | null;
};

declare global {
  var __forgeAutonomyLoop:
    | {
        bootedAt: Date | null;
        healthTimer: NodeJS.Timeout | null;
        mode: AutonomyMode;
      }
    | undefined;
}

function getState() {
  if (!globalThis.__forgeAutonomyLoop) {
    globalThis.__forgeAutonomyLoop = {
      bootedAt: null,
      healthTimer: null,
      mode: 'on',
    };
  }
  return globalThis.__forgeAutonomyLoop;
}

function parseTime(hhmm: string): { h: number; m: number } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return null;
  return { h, m: min };
}

/**
 * Renvoie `true` si `now` est dans la plage `range` (`HH:MM-HH:MM`).
 * Supporte les plages qui traversent minuit (`22:00-07:00`).
 */
export function isInQuietHours(now: Date = new Date(), range?: string | null): boolean {
  const r = String(range || '').trim();
  if (!r) return false;
  const parts = r.split('-');
  if (parts.length !== 2) return false;
  const start = parseTime(parts[0]);
  const end = parseTime(parts[1]);
  if (!start || !end) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = start.h * 60 + start.m;
  const endMin = end.h * 60 + end.m;
  if (startMin === endMin) return false;
  if (startMin < endMin) {
    return nowMin >= startMin && nowMin < endMin;
  }
  return nowMin >= startMin || nowMin < endMin;
}

async function readMode(): Promise<AutonomyMode> {
  const raw = (await getConfig('autonomyMode')).toLowerCase().trim();
  if (raw === 'off') return 'off';
  if (raw === 'quiet_hours') return 'quiet_hours';
  return 'on';
}

async function readQuietHours(): Promise<string> {
  return (await getConfig('autonomyQuietHours')).trim();
}

function startAllDaemons(): void {
  try {
    startScheduler();
  } catch (e) {
    console.warn('[autonomy] startScheduler:', e);
  }
  try {
    startBugDetector();
  } catch (e) {
    console.warn('[autonomy] startBugDetector:', e);
  }
  void startGithubWatcher().catch((e) => console.warn('[autonomy] startGithubWatcher:', e));
  void startTechWatch().catch((e) => console.warn('[autonomy] startTechWatch:', e));
}

function stopAllDaemons(): void {
  try {
    stopScheduler();
  } catch (e) {
    console.warn('[autonomy] stopScheduler:', e);
  }
  try {
    stopBugDetector();
  } catch (e) {
    console.warn('[autonomy] stopBugDetector:', e);
  }
  try {
    stopGithubWatcher();
  } catch (e) {
    console.warn('[autonomy] stopGithubWatcher:', e);
  }
  try {
    stopTechWatch();
  } catch (e) {
    console.warn('[autonomy] stopTechWatch:', e);
  }
}

async function healthCheck(): Promise<void> {
  const state = getState();
  if (state.mode === 'off') return;
  try {
    const bug = getBugDetectorStatus();
    if (!bug.running) {
      startBugDetector();
    }
    const gh = getGithubWatcherStatus();
    if (!gh.running) {
      await startGithubWatcher();
    }
    const tw = getTechWatchStatus();
    if (!tw.running) {
      await startTechWatch();
    }
  } catch (e) {
    console.warn('[autonomy] healthCheck:', e);
  }
}

/** Démarre la boucle d'autonomie selon la config persistée (idempotent). */
export async function startAutonomyLoop(): Promise<void> {
  const state = getState();
  const mode = await readMode();
  state.mode = mode;
  state.bootedAt = state.bootedAt ?? new Date();

  if (mode === 'off') {
    stopAllDaemons();
  } else {
    startAllDaemons();
  }

  if (!state.healthTimer) {
    state.healthTimer = setInterval(() => {
      void healthCheck().catch(() => undefined);
    }, 10 * 60_000);
  }

  await insertForgeActivityLog({
    actorType: 'system',
    actorId: 'autonomy',
    action: 'autonomy.boot',
    entityType: 'autonomy',
    entityId: 'loop',
    details: { mode },
  });
}

/** Met à jour le mode d'autonomie en persistant + en démarrant/arrêtant les daemons. */
export async function setAutonomyMode(mode: AutonomyMode): Promise<void> {
  await setConfig({ autonomyMode: mode });
  const state = getState();
  state.mode = mode;
  if (mode === 'off') {
    stopAllDaemons();
  } else {
    startAllDaemons();
  }
  await insertForgeActivityLog({
    actorType: 'user',
    actorId: 'autonomy',
    action: 'autonomy.mode_change',
    entityType: 'autonomy',
    entityId: 'loop',
    details: { mode },
  });
}

/** Statut public consommé par `/api/autonomy/status`. */
export async function getAutonomyStatus(): Promise<AutonomyStatus> {
  const state = getState();
  const mode = (state.mode || (await readMode())) as AutonomyMode;
  const quietHours = await readQuietHours();
  const bug = getBugDetectorStatus();
  const gh = getGithubWatcherStatus();
  const tw = getTechWatchStatus();
  return {
    mode,
    quietHours,
    inQuietHours: mode === 'quiet_hours' && isInQuietHours(new Date(), quietHours),
    subDaemons: [
      {
        name: 'scheduler',
        running: true, // Le scheduler est observé indirectement (singleton globalThis)
        lastError: null,
        lastTickAt: null,
      },
      {
        name: 'bug_detector',
        running: bug.running,
        lastError: bug.lastScanError,
        lastTickAt: bug.lastScanAt,
      },
      {
        name: 'github_watcher',
        running: gh.running,
        lastError: gh.lastRunError,
        lastTickAt: gh.lastRunAt,
      },
      {
        name: 'tech_watch',
        running: tw.running,
        lastError: tw.lastRunError,
        lastTickAt: tw.lastRunAt,
      },
    ],
    bootedAt: state.bootedAt ? state.bootedAt.toISOString() : null,
  };
}

/** Hint synchronique pour le scheduler : doit-il dispatcher de nouvelles tâches maintenant ? */
export async function shouldDispatchNow(now: Date = new Date()): Promise<boolean> {
  const mode = (getState().mode || (await readMode())) as AutonomyMode;
  if (mode === 'off') return false;
  if (mode === 'on') return true;
  const range = await readQuietHours();
  return !isInQuietHours(now, range);
}
