/**
 * Interroge Docker local : volumes du conteneur OpenClaw (`docker inspect`) et existence
 * d’un chemin dans le conteneur (`docker exec … test -d`).
 *
 * Forge doit pouvoir appeler la CLI Docker (socket monté ou installation sur l’hôte NAS).
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const DOCKER_TIMEOUT_MS = 12_000;

export type OpenClawDockerMount = {
  source: string;
  destination: string;
  type: string;
  mode: string;
};

export type OpenClawPathProbeResult = {
  attempted: boolean;
  skipReason?: string;
  dockerError?: string;
  containerName: string | null;
  mounts: OpenClawDockerMount[];
  pathTested: string;
  pathExistsInContainer: boolean;
  /** Au moins un bind dont Destination couvre pathTested */
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

async function execDocker(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execFileAsync('docker', args, {
      timeout: DOCKER_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    return { ok: true, stdout: String(stdout ?? ''), stderr: String(stderr ?? '') };
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer; stdout?: Buffer; message?: string };
    const stderr = err.stderr ? String(err.stderr) : '';
    const msg = typeof err.message === 'string' ? err.message : String(e);
    return { ok: false, stdout: '', stderr: stderr || msg };
  }
}

async function resolveContainerName(explicit?: string): Promise<string | null> {
  const trimmed = explicit?.trim();
  if (trimmed) {
    const check = await execDocker(['inspect', '--format', '{{.Id}}', trimmed]);
    if (check.ok) return trimmed;
  }
  const ps = await execDocker(['ps', '--filter', 'name=openclaw', '--format', '{{.Names}}']);
  if (!ps.ok) return null;
  const first = ps.stdout
    .split('\n')
    .map((s) => s.trim())
    .find(Boolean);
  return first ?? null;
}

export async function probeOpenClawContainerPath(params: {
  pathToTest: string;
  containerNameOverride?: string;
}): Promise<OpenClawPathProbeResult> {
  const emptyMounts: OpenClawDockerMount[] = [];

  if (process.env.FORGE_DISABLE_OPENCLAW_PATH_PROBE?.trim() === '1') {
    return {
      attempted: false,
      skipReason: 'FORGE_DISABLE_OPENCLAW_PATH_PROBE=1',
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

  const containerName = await resolveContainerName(params.containerNameOverride);
  if (!containerName) {
    const ver = await execDocker(['version', '--format', '{{.Client.Version}}']);
    const dockerError = ver.ok
      ? 'Aucun conteneur trouvé (docker ps — filtre name=openclaw). Indiquez le nom du conteneur dans Paramètres → Connexion OpenClaw.'
      : `CLI Docker inaccessible depuis Forge : ${ver.stderr.slice(0, 280)}`;
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

  const insp = await execDocker(['inspect', '--format', '{{json .Mounts}}', containerName]);
  let mounts: OpenClawDockerMount[] = [];
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
  }

  const likelyMountMatch = mounts.some(
    (m) => m.type === 'bind' && m.destination && pathUnderMount(pathTested, m.destination),
  );

  let pathExistsInContainer = false;
  try {
    await execFileAsync(
      'docker',
      ['exec', containerName, 'test', '-d', pathTested],
      { timeout: DOCKER_TIMEOUT_MS, windowsHide: true },
    );
    pathExistsInContainer = true;
  } catch {
    pathExistsInContainer = false;
  }

  return {
    attempted: true,
    dockerError: insp.ok ? undefined : insp.stderr.slice(0, 400),
    containerName,
    mounts,
    pathTested,
    pathExistsInContainer,
    likelyMountMatch,
  };
}
