// @ts-nocheck
import fs from 'fs';
import path from 'path';
export type DashboardServerDef = {
  id: string;
  label: string;
  port: number;
  npmScript: string;
};

export type ForgeAppDashboardConfig = {
  testUrl?: string;
  prodUrl?: string;
  /** URL explicite pour le dev local (sinon dérivée du port) */
  devLocalBaseUrl?: string;
  servers?: DashboardServerDef[];
};

const SCRIPT_RE = /^[a-zA-Z0-9:_-]{1,64}$/;
const ID_RE = /^[a-zA-Z0-9_-]{1,48}$/;

export function appDashboardConfigPath(projectPath: string): string {
  return path.join(projectPath, '.forge', 'app-dashboard.json');
}

export function devPidsDir(projectPath: string): string {
  return path.join(projectPath, '.forge', 'dev-pids');
}

export function defaultDashboardServers(): DashboardServerDef[] {
  return [{ id: 'web', label: 'Application (dev)', port: 4321, npmScript: 'dev' }];
}

function sanitizeServer(s: unknown): DashboardServerDef | null {
  if (!s || typeof s !== 'object') return null;
  const o = s as Record<string, unknown>;
  const id = String(o.id || '').trim();
  const label = String(o.label || '').trim();
  const npmScript = String(o.npmScript || 'dev').trim();
  const port = Number(o.port);
  if (!ID_RE.test(id) || label.length < 1 || label.length > 120) return null;
  if (!SCRIPT_RE.test(npmScript)) return null;
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { id, label, port, npmScript };
}

export function readAppDashboardConfig(projectPath: string): ForgeAppDashboardConfig {
  const file = appDashboardConfigPath(projectPath);
  try {
    if (!fs.existsSync(file)) {
      return { servers: defaultDashboardServers() };
    }
    const raw = fs.readFileSync(file, 'utf-8');
    const data = JSON.parse(raw) as ForgeAppDashboardConfig;
    const out: ForgeAppDashboardConfig = {};
    if (typeof data.testUrl === 'string' && data.testUrl.length <= 2048) {
      out.testUrl = data.testUrl.trim();
    }
    if (typeof data.prodUrl === 'string' && data.prodUrl.length <= 2048) {
      out.prodUrl = data.prodUrl.trim();
    }
    if (typeof data.devLocalBaseUrl === 'string' && data.devLocalBaseUrl.length <= 2048) {
      out.devLocalBaseUrl = data.devLocalBaseUrl.trim();
    }
    const servers = Array.isArray(data.servers)
      ? data.servers.map(sanitizeServer).filter(Boolean)
      : [];
    out.servers = servers.length > 0 ? servers : defaultDashboardServers();
    return out;
  } catch {
    return { servers: defaultDashboardServers() };
  }
}

export function writeAppDashboardConfig(
  projectPath: string,
  partial: ForgeAppDashboardConfig
): ForgeAppDashboardConfig | null {
  const current = readAppDashboardConfig(projectPath);
  const next: ForgeAppDashboardConfig = { ...current };

  if ('testUrl' in partial) {
    next.testUrl =
      partial.testUrl == null || partial.testUrl === ''
        ? undefined
        : String(partial.testUrl).trim().slice(0, 2048);
  }
  if ('prodUrl' in partial) {
    next.prodUrl =
      partial.prodUrl == null || partial.prodUrl === ''
        ? undefined
        : String(partial.prodUrl).trim().slice(0, 2048);
  }
  if ('devLocalBaseUrl' in partial) {
    next.devLocalBaseUrl =
      partial.devLocalBaseUrl == null || partial.devLocalBaseUrl === ''
        ? undefined
        : String(partial.devLocalBaseUrl).trim().slice(0, 2048);
  }
  if (partial.servers !== undefined) {
    if (!Array.isArray(partial.servers) || partial.servers.length > 8) {
      return null;
    }
    const cleaned = partial.servers.map(sanitizeServer).filter(Boolean);
    if (cleaned.length === 0) return null;
    const ids = new Set<string>();
    for (const s of cleaned) {
      if (ids.has(s.id)) return null;
      ids.add(s.id);
    }
    next.servers = cleaned;
  }

  try {
    const dir = path.dirname(appDashboardConfigPath(projectPath));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      appDashboardConfigPath(projectPath),
      JSON.stringify(next, null, 2),
      'utf-8'
    );
    return next;
  } catch {
    return null;
  }
}

export function readPackageScripts(projectPath: string): { name?: string; scripts: string[] } {
  const pkgPath = path.join(projectPath, 'package.json');
  try {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(raw);
    const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? Object.keys(pkg.scripts) : [];
    return {
      name: typeof pkg.name === 'string' ? pkg.name : undefined,
      scripts: scripts.filter((k) => SCRIPT_RE.test(k)),
    };
  } catch {
    return { scripts: [] };
  }
}
