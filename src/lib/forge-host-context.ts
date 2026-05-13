/**
 * Détection automatique de l'hôte d'exécution Forge.
 *
 * Permet aux modules (infra-client, tool-bus, docker) de choisir
 * automatiquement le bon mode (local Windows en dev, conteneur Linux NAS en prod)
 * sans configuration manuelle obligatoire.
 *
 * Le résultat est mis en cache : le contexte ne change pas pendant l'exécution.
 */
import fs from 'node:fs';
import os from 'node:os';

export type HostKind = 'local_windows' | 'local_macos' | 'local_linux' | 'container_linux' | 'unknown';

export type HostContext = {
  /** Type d'hôte résolu. */
  kind: HostKind;
  /** Plateforme Node brute (`process.platform`). */
  platform: NodeJS.Platform;
  /** L'application tourne dans un conteneur Docker. */
  isDocker: boolean;
  /** Le socket Docker est accessible localement. */
  hasDockerSocket: boolean;
  /** Architecture CPU (`x64`, `arm64`, …). */
  arch: string;
  /** Hostname (utile pour logs). */
  hostname: string;
  /** Mode infra par défaut suggéré pour `forge-infra-client`. */
  defaultInfraMode: 'local' | 'remote_ssh';
};

let _cached: HostContext | null = null;

function detectIsDocker(): boolean {
  if (process.env.IS_DOCKER === '1' || process.env.IS_DOCKER === 'true') return true;
  if (process.env.DOCKER_CONTAINER === 'true') return true;
  try {
    if (fs.existsSync('/.dockerenv')) return true;
  } catch {
    /* ignore */
  }
  try {
    const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf-8');
    if (/docker|kubepods|containerd/i.test(cgroup)) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function detectHasDockerSocket(): boolean {
  try {
    if (process.platform === 'win32') {
      return fs.existsSync('//./pipe/docker_engine');
    }
    return fs.existsSync('/var/run/docker.sock');
  } catch {
    return false;
  }
}

function resolveKind(platform: NodeJS.Platform, isDocker: boolean): HostKind {
  if (isDocker) return 'container_linux';
  if (platform === 'win32') return 'local_windows';
  if (platform === 'darwin') return 'local_macos';
  if (platform === 'linux') return 'local_linux';
  return 'unknown';
}

export function detectHostContext(): HostContext {
  const platform = process.platform;
  const isDocker = detectIsDocker();
  const hasDockerSocket = detectHasDockerSocket();
  const kind = resolveKind(platform, isDocker);

  const sshConfigured = Boolean(
    (process.env.FORGE_SSH_HOST || '').trim() ||
      (process.env.FORGE_REMOTE_HOST || '').trim(),
  );
  const defaultInfraMode: 'local' | 'remote_ssh' = sshConfigured ? 'remote_ssh' : 'local';

  return {
    kind,
    platform,
    isDocker,
    hasDockerSocket,
    arch: process.arch,
    hostname: os.hostname(),
    defaultInfraMode,
  };
}

export function getHostContext(): HostContext {
  if (!_cached) _cached = detectHostContext();
  return _cached;
}

export function resetHostContextCache(): void {
  _cached = null;
}

/**
 * Vrai si l'hôte est susceptible d'avoir Docker accessible.
 * Utilisé par les outils docker_* pour décider socket vs CLI.
 */
export function canAccessDockerLocally(): boolean {
  const ctx = getHostContext();
  return ctx.hasDockerSocket || ctx.isDocker;
}

/**
 * Vrai si on est sur Windows local (utile pour winget/scoop, chemins, etc.).
 */
export function isWindowsLocal(): boolean {
  return getHostContext().kind === 'local_windows';
}

/**
 * Vrai si on est dans le conteneur Linux du NAS.
 */
export function isContainer(): boolean {
  return getHostContext().isDocker;
}
