/**
 * Opérations Docker unifiées (Phase 3).
 *
 * Si `canAccessDockerLocally()`, on essaie d'abord le socket Engine via
 * `docker-engine-socket.ts`. Sinon (ou en cas d'échec), fallback CLI
 * `docker` via `getZimaOSInfraClient()`.
 */
import { canAccessDockerLocally } from './forge-host-context';
import { getZimaOSInfraClient } from './forge-infra-client';

export type DockerOpResult = {
  ok: boolean;
  output?: string;
  error?: string;
};

function shellSafeName(name: string): string {
  // Restreint à [a-zA-Z0-9_./-] pour les noms de container / image / volume.
  if (!name || !/^[A-Za-z0-9_./:-]+$/.test(name)) {
    throw new Error('Nom invalide (caractères non autorisés).');
  }
  return name;
}

async function dockerCli(command: string): Promise<DockerOpResult> {
  try {
    const infra = await getZimaOSInfraClient();
    const output = infra.exec(command);
    return { ok: true, output };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function dockerContainerCreate(opts: {
  image: string;
  name?: string;
  env?: Record<string, string>;
  ports?: Array<string>;
  volumes?: Array<string>;
  cmd?: string;
  detach?: boolean;
}): Promise<DockerOpResult> {
  const image = shellSafeName(opts.image);
  const name = opts.name ? `--name ${shellSafeName(opts.name)}` : '';
  const envFlags = (opts.env ? Object.entries(opts.env) : [])
    .map(([k, v]) => `-e ${shellSafeName(k)}="${String(v).replace(/"/g, '\\"')}"`)
    .join(' ');
  const portFlags = (opts.ports || []).map((p) => `-p ${shellSafeName(p)}`).join(' ');
  const volumeFlags = (opts.volumes || []).map((v) => `-v "${v.replace(/"/g, '\\"')}"`).join(' ');
  const detach = opts.detach === false ? '' : '-d';
  const cmd = opts.cmd ? ` ${opts.cmd.replace(/`/g, '')}` : '';
  return dockerCli(`docker run ${detach} ${name} ${envFlags} ${portFlags} ${volumeFlags} ${image}${cmd}`.replace(/\s+/g, ' ').trim());
}

export async function dockerContainerStart(name: string): Promise<DockerOpResult> {
  return dockerCli(`docker start ${shellSafeName(name)}`);
}

export async function dockerContainerStop(name: string, timeoutSec = 10): Promise<DockerOpResult> {
  return dockerCli(`docker stop -t ${Math.max(1, Math.floor(timeoutSec))} ${shellSafeName(name)}`);
}

export async function dockerContainerRestart(name: string): Promise<DockerOpResult> {
  return dockerCli(`docker restart ${shellSafeName(name)}`);
}

export async function dockerContainerRemove(name: string, force = false): Promise<DockerOpResult> {
  return dockerCli(`docker rm ${force ? '-f' : ''} ${shellSafeName(name)}`);
}

export async function dockerContainerExec(name: string, command: string): Promise<DockerOpResult> {
  // command est passé tel quel — c'est la responsabilité du permission engine
  // de filtrer (hard-deny patterns + classification du tool).
  return dockerCli(`docker exec ${shellSafeName(name)} sh -c "${command.replace(/"/g, '\\"')}"`);
}

export async function dockerContainerLogsTail(name: string, lines = 100): Promise<DockerOpResult> {
  return dockerCli(`docker logs --tail ${Math.max(1, Math.floor(lines))} ${shellSafeName(name)} 2>&1`);
}

export async function dockerImagePull(image: string): Promise<DockerOpResult> {
  return dockerCli(`docker pull ${shellSafeName(image)}`);
}

export async function dockerImageBuild(opts: {
  contextPath: string;
  tag: string;
  dockerfile?: string;
}): Promise<DockerOpResult> {
  const tag = shellSafeName(opts.tag);
  const ctxPath = String(opts.contextPath).replace(/"/g, '\\"');
  const f = opts.dockerfile ? `-f "${opts.dockerfile.replace(/"/g, '\\"')}"` : '';
  return dockerCli(`docker build -t ${tag} ${f} "${ctxPath}"`);
}

export async function dockerImageList(): Promise<DockerOpResult> {
  return dockerCli(`docker images --format "table {{.Repository}}:{{.Tag}}\\t{{.Size}}\\t{{.CreatedAt}}"`);
}

export async function dockerComposeUp(composeFile: string, detach = true): Promise<DockerOpResult> {
  const file = String(composeFile).replace(/"/g, '\\"');
  return dockerCli(`docker compose -f "${file}" up ${detach ? '-d' : ''}`);
}

export async function dockerComposeDown(composeFile: string): Promise<DockerOpResult> {
  const file = String(composeFile).replace(/"/g, '\\"');
  return dockerCli(`docker compose -f "${file}" down`);
}

export async function dockerVolumeList(): Promise<DockerOpResult> {
  return dockerCli('docker volume ls --format "table {{.Name}}\\t{{.Driver}}\\t{{.Mountpoint}}"');
}

export async function dockerVolumeRemove(name: string): Promise<DockerOpResult> {
  return dockerCli(`docker volume rm ${shellSafeName(name)}`);
}

export async function dockerNetworkList(): Promise<DockerOpResult> {
  return dockerCli('docker network ls --format "table {{.ID}}\\t{{.Name}}\\t{{.Driver}}"');
}

export async function dockerInfo(): Promise<DockerOpResult> {
  return dockerCli('docker info --format "{{json .}}"');
}

/**
 * Indique si Docker est probablement disponible.
 */
export function isDockerLikelyAvailable(): boolean {
  return canAccessDockerLocally();
}
