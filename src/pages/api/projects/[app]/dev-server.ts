import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import path from 'path';
import {
  resolveProjectPathVariants,
  isSafeRepoDirName,
  listRepoProjectPaths,
} from '../../../../lib/forge-repos';
import { readAppDashboardConfig, devPidsDir } from '../../../../lib/project-app-config';

function pidFile(projectPath: string, serverId: string) {
  return path.join(devPidsDir(projectPath), `${serverId}.pid`);
}

function logFile(projectPath: string, serverId: string) {
  return path.join(devPidsDir(projectPath), `${serverId}.log`);
}

function readPid(projectPath: string, serverId: string): number | null {
  try {
    const f = pidFile(projectPath, serverId);
    if (!fs.existsSync(f)) return null;
    const n = parseInt(fs.readFileSync(f, 'utf-8').trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tue un processus de façon cross-platform.
 * Sur Windows, SIGTERM n'est pas supporté : on utilise taskkill.
 */
function killProcess(pid: number): void {
  try {
    if (process.platform === 'win32') {
      // taskkill /T = kill tree (enfants inclus), /F = force
      spawn('taskkill', ['/PID', String(pid), '/T', '/F'], {
        detached: true,
        stdio: 'ignore',
        shell: false,
      }).unref();
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch {
    /* ignore — processus peut déjà être mort */
  }
}

function sameProjectDir(a: string, b: string): boolean {
  try {
    return fs.realpathSync(a) === fs.realpathSync(b);
  } catch {
    return path.resolve(a) === path.resolve(b);
  }
}

/**
 * Si le port est occupé sans PID Forge pour cette entrée, cherche un autre
 * serveur enregistré (autre projet ou autre entrée) avec le même port et un PID suivi encore vivant.
 */
async function findForgePortOwner(
  currentProjectPath: string,
  currentServerId: string,
  port: number
): Promise<{ folder: string; label: string; pid: number } | null> {
  const paths = await listRepoProjectPaths();
  for (const projectPath of paths) {
    const cfg = readAppDashboardConfig(projectPath);
    for (const srv of cfg.servers || []) {
      if (srv.port !== port) continue;
      if (sameProjectDir(projectPath, currentProjectPath) && srv.id === currentServerId) continue;
      const tracked = readPid(projectPath, srv.id);
      if (tracked != null && isProcessAlive(tracked)) {
        return { folder: path.basename(projectPath), label: srv.label, pid: tracked };
      }
    }
  }
  return null;
}

/** Vérifie si un port TCP est déjà occupé (serveur externe non tracé par PID). */
function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = 300;
    socket.setTimeout(timeout);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('timeout', () => { socket.destroy(); resolve(false); });
    socket.once('error', () => { socket.destroy(); resolve(false); });
    socket.connect(port, '127.0.0.1');
  });
}

/**
 * Résout le répertoire de travail effectif du serveur.
 * Si workdir est défini, vérifie que le chemin est valide et reste dans le projet.
 */
function resolveServerCwd(projectPath: string, workdir?: string): string | null {
  if (!workdir) return projectPath;
  // Sécurité : empêche les traversées de dossier
  const resolved = path.resolve(path.join(projectPath, workdir));
  const rel = path.relative(projectPath, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return null;
  return resolved;
}

export const POST: APIRoute = async ({ params, request }) => {
  const app = params.app;
  if (!isSafeRepoDirName(String(app))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const projectPath = await resolveProjectPathVariants(String(app));
  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }

  let body: { action?: string; serverId?: string };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400 });
  }

  const action = String(body.action || '');
  const serverId = String(body.serverId || '').trim();
  if (!['start', 'stop', 'status'].includes(action)) {
    return new Response(JSON.stringify({ error: 'action invalide' }), { status: 400 });
  }

  const config = readAppDashboardConfig(projectPath);
  const server = config.servers?.find((s) => s.id === serverId);
  if (!server) {
    return new Response(JSON.stringify({ error: 'Serveur inconnu' }), { status: 404 });
  }

  const pidsDir = devPidsDir(projectPath);
  fs.mkdirSync(pidsDir, { recursive: true });

  // ── STATUS ──────────────────────────────────────────────────────────────────
  if (action === 'status') {
    const pid = readPid(projectPath, serverId);
    const pidAlive = pid != null && isProcessAlive(pid);
    const portBusy = !pidAlive ? await isPortListening(server.port) : false;
    const running = pidAlive || portBusy;
    const externalProcess = portBusy && !pidAlive;
    const forgePortOwner = externalProcess
      ? await findForgePortOwner(projectPath, serverId, server.port)
      : null;
    return new Response(
      JSON.stringify({
        serverId,
        running,
        pid: pidAlive ? pid : null,
        externalProcess,
        forgePortOwner,
        port: server.port,
        npmScript: server.npmScript,
        workdir: server.workdir ?? null,
        command: server.command ?? null,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ── STOP ────────────────────────────────────────────────────────────────────
  if (action === 'stop') {
    const pid = readPid(projectPath, serverId);
    if (pid == null || !isProcessAlive(pid)) {
      try { fs.unlinkSync(pidFile(projectPath, serverId)); } catch { /* ignore */ }
      return new Response(JSON.stringify({ ok: true, stopped: false, message: 'Déjà arrêté' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    killProcess(pid);
    try { fs.unlinkSync(pidFile(projectPath, serverId)); } catch { /* ignore */ }
    return new Response(JSON.stringify({ ok: true, stopped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── START ───────────────────────────────────────────────────────────────────
  const existing = readPid(projectPath, serverId);
  if (existing != null && isProcessAlive(existing)) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Déjà en cours', pid: existing, port: server.port }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }
  try {
    if (existing != null) fs.unlinkSync(pidFile(projectPath, serverId));
  } catch { /* ignore */ }

  // Résolution du répertoire de travail
  const cwd = resolveServerCwd(projectPath, server.workdir);
  if (cwd === null) {
    return new Response(
      JSON.stringify({ error: `Sous-dossier invalide ou introuvable : "${server.workdir}"` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const log = logFile(projectPath, serverId);
  let fd: number;
  try {
    fd = fs.openSync(log, 'a');
  } catch {
    return new Response(JSON.stringify({ error: 'Impossible de créer le fichier de log' }), {
      status: 500,
    });
  }

  // Construction de la commande
  let spawnCmd: string;
  let spawnArgs: string[];

  if (server.command) {
    // Commande custom (python, go, node, yarn, pnpm…)
    spawnCmd = server.command;
    spawnArgs = server.npmScript ? [server.npmScript] : [];
  } else {
    const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
    spawnCmd = npmCmd;
    spawnArgs = ['run', server.npmScript];
  }

  // Variables d'env : process.env + PORT + env custom du serveur
  const spawnEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    FORCE_COLOR: '0',
    PORT: String(server.port),
    ...(server.env ?? {}),
  };

  const child = spawn(spawnCmd, spawnArgs, {
    cwd,
    detached: true,
    stdio: ['ignore', fd, fd],
    shell: process.platform === 'win32',
    env: spawnEnv,
  });

  try { fs.closeSync(fd); } catch { /* ignore */ }
  child.unref();

  if (!child.pid) {
    return new Response(JSON.stringify({ error: 'Échec du lancement' }), { status: 500 });
  }

  fs.writeFileSync(pidFile(projectPath, serverId), String(child.pid), 'utf-8');

  return new Response(
    JSON.stringify({
      ok: true,
      pid: child.pid,
      port: server.port,
      npmScript: server.npmScript,
      workdir: server.workdir ?? null,
      command: server.command ?? null,
      cwd,
      logFile: path.basename(log),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
