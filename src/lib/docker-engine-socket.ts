/**
 * Client minimal de l’API Docker Engine via socket Unix (sans binaire `docker`).
 * Utilisé par la sonde ZimaOS quand seul /var/run/docker.sock est monté.
 */
import fs from 'node:fs';
import http from 'node:http';

const DEFAULT_SOCKET = '/var/run/docker.sock';
const API_PREFIX = '/v1.41';

function socketPath(): string {
  return process.env.FORGE_DOCKER_SOCKET?.trim() || DEFAULT_SOCKET;
}

export function dockerSocketPresent(): boolean {
  try {
    return fs.existsSync(socketPath());
  } catch {
    return false;
  }
}

type DockerRequestOptions = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  body?: string;
};

export async function dockerApiRequest<T = unknown>(opts: DockerRequestOptions): Promise<{
  ok: boolean;
  status: number;
  json: T | null;
  text: string;
}> {
  const sock = socketPath();
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: sock,
        path: opts.path.startsWith('/') ? opts.path : `/${opts.path}`,
        method: opts.method,
        headers:
          opts.body !== undefined
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(opts.body, 'utf8') }
            : {},
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          let parsed: T | null = null;
          if (text && res.headers['content-type']?.includes('application/json')) {
            try {
              parsed = JSON.parse(text) as T;
            } catch {
              parsed = null;
            }
          } else if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
            try {
              parsed = JSON.parse(text) as T;
            } catch {
              parsed = null;
            }
          }
          resolve({ ok: res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode ?? 0, json: parsed, text });
        });
      },
    );
    req.setTimeout(12_000, () => {
      req.destroy(new Error('Docker API timeout'));
    });
    req.on('error', reject);
    if (opts.body !== undefined) req.write(opts.body);
    req.end();
  });
}

export type DockerContainerSummary = {
  Id: string;
  Names?: string[];
  State?: string;
  Status?: string;
};

export async function listAllContainers(): Promise<DockerContainerSummary[]> {
  const r = await dockerApiRequest<DockerContainerSummary[]>({
    method: 'GET',
    path: `${API_PREFIX}/containers/json?all=1`,
  });
  if (!r.ok || !Array.isArray(r.json)) return [];
  return r.json;
}

export async function inspectContainer(nameOrId: string): Promise<{
  ok: boolean;
  mounts?: Array<{ Type?: string; Source?: string; Destination?: string; Mode?: string }>;
  raw?: unknown;
  error?: string;
}> {
  const id = encodeURIComponent(nameOrId);
  const r = await dockerApiRequest({
    method: 'GET',
    path: `${API_PREFIX}/containers/${id}/json`,
  });
  if (!r.ok) {
    return { ok: false, error: r.text.slice(0, 400) };
  }
  const j = r.json as { Mounts?: Array<{ Type?: string; Source?: string; Destination?: string; Mode?: string }> } | null;
  return { ok: true, mounts: j?.Mounts ?? [], raw: j };
}

/** Premier conteneur dont un nom contient la sous-chaîne (insensible à la casse). */
export function pickContainerByNameSubstring(
  list: DockerContainerSummary[],
  substring: string,
): DockerContainerSummary | null {
  const q = substring.trim().toLowerCase();
  if (!q) return null;
  for (const c of list) {
    const names = c.Names ?? [];
    for (const n of names) {
      const base = n.replace(/^\//, '');
      if (base.toLowerCase().includes(q)) return c;
    }
  }
  return null;
}

export async function execTestDirectory(containerId: string, dirPath: string): Promise<{ ok: boolean; exitCode: number; error?: string }> {
  const create = await dockerApiRequest<{ Id?: string }>({
    method: 'POST',
    path: `${API_PREFIX}/containers/${encodeURIComponent(containerId)}/exec`,
    body: JSON.stringify({
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
      Cmd: ['test', '-d', dirPath],
    }),
  });
  const execId = create.json && typeof create.json === 'object' && create.json !== null && 'Id' in create.json
    ? String((create.json as { Id?: string }).Id ?? '')
    : '';
  if (!create.ok || !execId) {
    return { ok: false, exitCode: -1, error: create.text.slice(0, 300) || 'exec create failed' };
  }

  const start = await dockerApiRequest({
    method: 'POST',
    path: `${API_PREFIX}/exec/${encodeURIComponent(execId)}/start`,
    body: JSON.stringify({ Detach: true }),
  });
  if (!start.ok) {
    return { ok: false, exitCode: -1, error: start.text.slice(0, 300) };
  }

  for (let i = 0; i < 40; i++) {
    const insp = await dockerApiRequest<{ Running?: boolean; ExitCode?: number }>({
      method: 'GET',
      path: `${API_PREFIX}/exec/${encodeURIComponent(execId)}/json`,
    });
    const data = insp.json;
    if (insp.ok && data && data.Running === false && typeof data.ExitCode === 'number') {
      return { ok: true, exitCode: data.ExitCode };
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return { ok: false, exitCode: -1, error: 'exec inspect timeout' };
}
