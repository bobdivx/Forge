/**
 * État rapide du premier serveur de dev défini dans `.forge/app-dashboard.json`
 * (réutilisable par le dashboard sans dupliquer toute la route POST dev-server).
 */
import fs from 'fs';
import net from 'net';
import path from 'path';
import { readAppDashboardConfig, devPidsDir } from './project-app-config';

function pidFile(projectPath: string, serverId: string) {
  return path.join(devPidsDir(projectPath), `${serverId}.pid`);
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

function isPortListening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(300);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
    socket.connect(port, '127.0.0.1');
  });
}

export type PrimaryDevServerStatus = {
  serverId: string;
  label: string;
  port: number;
  running: boolean;
  pidAlive: boolean;
  externalProcess: boolean;
};

/** null si pas de config serveur ou projet introuvable sur disque. */
export async function getPrimaryDevServerStatus(projectPath: string): Promise<PrimaryDevServerStatus | null> {
  if (!projectPath || !fs.existsSync(projectPath)) return null;
  const config = readAppDashboardConfig(projectPath);
  const server = config.servers?.[0];
  if (!server) return null;

  const pid = readPid(projectPath, server.id);
  const pidAlive = pid != null && isProcessAlive(pid);
  const portBusy = !pidAlive ? await isPortListening(server.port) : false;
  const running = pidAlive || portBusy;
  const externalProcess = portBusy && !pidAlive;

  return {
    serverId: server.id,
    label: server.label,
    port: server.port,
    running,
    pidAlive,
    externalProcess,
  };
}
