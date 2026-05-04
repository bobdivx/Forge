/**
 * Interroge Docker local : volumes du conteneur ZimaOS et test `test -d`, d’abord via
 * l’API Engine sur le socket Unix (pas besoin du binaire `docker`), sinon via la CLI.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import {
  dockerApiRequest,
  dockerSocketPresent,
  listAllContainers,
  pickContainerByNameSubstring,
  inspectContainer,
  execTestDirectory,
} from './docker-engine-socket';

const execFileAsync = promisify(execFile);
const DOCKER_TIMEOUT_MS = 12_000;
const API_PREFIX = '/v1.41';

export type ZimaOSDockerMount = {
  source: string;
  destination: string;
  type: string;
  mode: string;
};

export type ZimaOSPathProbeResult = {
  attempted: boolean;
  skipReason?: string;
  dockerError?: string;
  containerName: string | null;
  mounts: ZimaOSDockerMount[];
  pathTested: string;
  pathExistsInContainer: boolean;
  likelyMountMatch: boolean;
};

function normalizeAbs(p: string): string {
  return path.normalize(path.resolve(p.trim())).replace(/\\/g, '/');
}

function pathUnderMount(containerPath: string, mountDest: string): boolean {
  const c = normalizeAbs(containerPath);
  const d = normalizeAbs(mountDest);
  if (!d) return false;
  if (c === d) return true;
  const prefix = d.endsWith('/') ? d : `${d}/`;
  return c.startsWith(prefix);
}

async function execDockerCli(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('docker', args, {
      timeout: DOCKER_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') };
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; message?: string };
    const stderr = err.stderr ? String(err.stderr) : '';
    const msg = typeof err.message === 'string' ? err.message : String(e);
    return { ok: false, stdout: '', stderr: stderr || msg };
  }
}

async function pingDockerSocket(): Promise<boolean> {
  try {
    const r = await dockerApiRequest({ method: 'GET', path: `${API_PREFIX}/version` });
    return Boolean(r.ok);
  } catch {
    return false;
  }
}

async function resolveContainerIdSocket(explicit?: string): Promise<string | null> {
  const ex = explicit?.trim();
  if (ex) {
    const insp = await inspectContainer(ex);
    if (insp.ok && insp.raw && typeof insp.raw === 'object' && insp.raw !== null && 'Id' in insp.raw) {
      return String((insp.raw as { Id: string }).Id);
    }
  }
  const list = await listAllContainers();
  const picked = pickContainerByNameSubstring(list, 'zimaos');
  return picked?.Id ?? null;
}

async function listZimaosContainersSocket(): Promise<string[]> {
  const list = await listAllContainers();
  const names = new Set<string>();
  for (const c of list) {
    for (const raw of c.Names ?? []) {
      const n = raw.replace(/^\//, '').trim();
      if (!n) continue;
      if (n.toLowerCase().includes('zimaos')) names.add(n);
    }
  }
  return [...names].sort();
}

async function resolveContainerNameCli(explicit?: string): Promise<string | null> {
  const trimmed = explicit?.trim();
  if (trimmed) {
    const check = await execDockerCli(['inspect', '--format', '{{.Id}}', trimmed]);
    if (check.ok) return trimmed;
  }
  const ps = await execDockerCli(['ps', '--filter', 'name=zimaos', '--format', '{{.Names}}']);
  if (!ps.ok) return null;
  const first = ps.stdout
    .split('\n')
    .map((s) => s.trim())
    .find(Boolean);
  return first ?? null;
}

async function listZimaosContainersCli(): Promise<string[]> {
  const ps = await execDockerCli(['ps', '--filter', 'name=zimaos', '--format', '{{.Names}}']);
  if (!ps.ok) return [];
  const rows = ps.stdout
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(rows)].sort();
}

export async function probeZimaOSContainerPath(params: {
  pathToTest: string;
  containerNameOverride?: string;
}): Promise<ZimaOSPathProbeResult> {
  const emptyMounts: ZimaOSDockerMount[] = [];

  if (process.env.FORGE_DISABLE_ZIMAOS_PATH_PROBE?.trim() === '1') {
    return {
      attempted: false,
      skipReason: 'FORGE_DISABLE_ZIMAOS_PATH_PROBE=1',
      containerName: null,
      mounts: emptyMounts,
      pathTested: '',
      pathExistsInContainer: false,
      likelyMountMatch: false,
    };
  }

  const pathTested = normalizeAbs(params.pathToTest || '');
  if (!pathTested || pathTested === '/') {
    return {
      attempted: false,
      skipReason: 'Chemin invalide ou vide',
      containerName: null,
      mounts: emptyMounts,
      pathTested,
      pathExistsInContainer: false,
      likelyMountMatch: false,
    };
  }

  const socketHere = dockerSocketPresent();
  const socketAlive = socketHere && (await pingDockerSocket());
  let containerId: string | null = null;
  let displayName: string | null = null;
  let dockerError: string | undefined;

  if (socketAlive) {
    const explicit = params.containerNameOverride?.trim();
    const candidates = explicit ? [] : await listZimaosContainersSocket();
    if (!explicit && candidates.length > 1) {
      dockerError = `Plusieurs conteneurs ZimaOS détectés (${candidates.join(', ')}). Renseignez le nom exact dans Paramètres → ZimaOS.`;
    }
    if (!dockerError) {
      containerId = await resolveContainerIdSocket(params.containerNameOverride);
    }
    if (containerId) {
      const full = await inspectContainer(containerId);
      const raw = full.raw as { Name?: string } | undefined;
      if (raw?.Name) displayName = String(raw.Name).replace(/^\//, '') || containerId.slice(0, 12);
      else displayName = containerId.slice(0, 12);
    }
    if (!containerId) {
      dockerError =
        'Aucun conteneur trouvé (nom contenant « zimaos »). Indiquez le nom du sandbox dans Paramètres → ZimaOS.';
    }
  } else {
    const ver = await execDockerCli(['version', '--format', '{{.Client.Version}}']);
    if (!ver.ok) {
      dockerError = socketHere
        ? `Socket Docker présent mais API injoignable. Détail : ${ver.stderr.slice(0, 160)}`
        : ver.stderr.toLowerCase().includes('enoent')
          ? `Pas de socket Docker lisible et pas de CLI « docker » dans le conteneur (${ver.stderr.slice(0, 200)})`
          : `CLI Docker inaccessible : ${ver.stderr.slice(0, 280)}`;
    } else {
      const explicit = params.containerNameOverride?.trim();
      const candidates = explicit ? [] : await listZimaosContainersCli();
      if (!explicit && candidates.length > 1) {
        dockerError = `Plusieurs conteneurs ZimaOS détectés (${candidates.join(', ')}). Renseignez le nom exact dans Paramètres → ZimaOS.`;
      }
      const name = dockerError ? null : await resolveContainerNameCli(params.containerNameOverride);
      if (name) {
        const idOut = await execDockerCli(['inspect', '--format', '{{.Id}}', name]);
        containerId = idOut.ok && idOut.stdout.trim() ? idOut.stdout.trim() : name;
        displayName = name.replace(/^\//, '');
      }
      if (!containerId) {
        dockerError =
          'Aucun conteneur trouvé (docker ps — filtre name=zimaos). Indiquez le nom du conteneur dans Paramètres → ZimaOS.';
      }
    }
  }

  if (!containerId) {
    return {
      attempted: true,
      dockerError,
      containerName: null,
      mounts: emptyMounts,
      pathTested,
      pathExistsInContainer: false,
      likelyMountMatch: false,
    };
  }

  let mounts: ZimaOSDockerMount[] = [];
  let inspectErr: string | undefined;

  if (socketAlive) {
    const insp = await inspectContainer(containerId);
    if (insp.ok && insp.mounts?.length) {
      mounts = insp.mounts.map((m) => ({
        source: String(m.Source ?? ''),
        destination: String(m.Destination ?? ''),
        type: String(m.Type ?? ''),
        mode: String(m.Mode ?? ''),
      }));
    } else if (!insp.ok) {
      inspectErr = insp.error;
    }
  }

  if (mounts.length === 0) {
    const insp = await execDockerCli(['inspect', '--format', '{{json .Mounts}}', containerId]);
    if (insp.ok && insp.stdout.trim()) {
      try {
        const raw = JSON.parse(insp.stdout.trim()) as Array<Record<string, unknown>>;
        mounts = raw.map((m) => ({
          source: String(m.Source ?? ''),
          destination: String(m.Destination ?? ''),
          type: String(m.Type ?? ''),
          mode: String(m.Mode ?? ''),
        }));
      } catch {
        mounts = [];
      }
    } else if (!inspectErr) {
      inspectErr = insp.stderr.slice(0, 400);
    }
  }

  const likelyMountMatch = mounts.some(
    (m) => m.type === 'bind' && m.destination && pathUnderMount(pathTested, m.destination),
  );

  let pathExistsInContainer = false;
  if (socketAlive) {
    const ex = await execTestDirectory(containerId, pathTested);
    pathExistsInContainer = ex.ok && ex.exitCode === 0;
  } else {
    try {
      await execFileAsync('docker', ['exec', containerId, 'test', '-d', pathTested], {
        timeout: DOCKER_TIMEOUT_MS,
        windowsHide: true,
      });
      pathExistsInContainer = true;
    } catch {
      pathExistsInContainer = false;
    }
  }

  return {
    attempted: true,
    dockerError: inspectErr?.slice(0, 400),
    containerName: displayName,
    mounts,
    pathTested,
    pathExistsInContainer,
    likelyMountMatch,
  };
}
