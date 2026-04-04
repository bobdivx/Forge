import type { APIRoute } from 'astro';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { resolveProjectPathVariants, isSafeRepoDirName } from '../../../../lib/forge-repos';
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

export const POST: APIRoute = async ({ params, request }) => {
  const app = params.app;
  if (!isSafeRepoDirName(String(app))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const projectPath = resolveProjectPathVariants(String(app));
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

  if (action === 'status') {
    const pid = readPid(projectPath, serverId);
    const running = pid != null && isProcessAlive(pid);
    return new Response(
      JSON.stringify({
        serverId,
        running,
        pid: running ? pid : null,
        port: server.port,
        npmScript: server.npmScript,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (action === 'stop') {
    const pid = readPid(projectPath, serverId);
    if (pid == null || !isProcessAlive(pid)) {
      try {
        fs.unlinkSync(pidFile(projectPath, serverId));
      } catch {
        /* ignore */
      }
      return new Response(JSON.stringify({ ok: true, stopped: false, message: 'Déjà arrêté' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* ignore */
    }
    try {
      fs.unlinkSync(pidFile(projectPath, serverId));
    } catch {
      /* ignore */
    }
    return new Response(JSON.stringify({ ok: true, stopped: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // start
  const existing = readPid(projectPath, serverId);
  if (existing != null && isProcessAlive(existing)) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'Déjà en cours',
        pid: existing,
        port: server.port,
      }),
      { status: 409, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    if (existing != null) {
      fs.unlinkSync(pidFile(projectPath, serverId));
    }
  } catch {
    /* ignore */
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

  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const child = spawn(npmCmd, ['run', server.npmScript], {
    cwd: projectPath,
    detached: true,
    stdio: ['ignore', fd, fd],
    shell: false,
    env: { ...process.env, FORCE_COLOR: '0' },
  });

  try {
    fs.closeSync(fd);
  } catch {
    /* ignore */
  }

  child.unref();

  if (!child.pid) {
    return new Response(JSON.stringify({ error: 'Échec du lancement npm' }), { status: 500 });
  }

  fs.writeFileSync(pidFile(projectPath, serverId), String(child.pid), 'utf-8');

  return new Response(
    JSON.stringify({
      ok: true,
      pid: child.pid,
      port: server.port,
      npmScript: server.npmScript,
      logFile: path.basename(log),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};
