// @ts-nocheck
import fs from 'fs';
import path from 'path';
export type DashboardServerDef = {
  id: string;
  label: string;
  port: number;
  npmScript: string;
  /**
   * Chemin relatif depuis la racine du projet (ex: "backend", "packages/client").
   * Si absent, utilise la racine du projet.
   */
  workdir?: string;
  /**
   * Commande custom au lieu de `npm run <npmScript>`.
   * Ex: "python", "go", "node", "pnpm", "yarn".
   * Si absent, utilise npm.
   */
  command?: string;
  /**
   * Variables d'environnement supplémentaires pour ce serveur.
   * Fusionnées avec process.env (ces valeurs ont priorité).
   */
  env?: Record<string, string>;
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
const WORKDIR_RE = /^[a-zA-Z0-9._/-]{0,128}$/;
const COMMAND_RE = /^[a-zA-Z0-9._/-]{1,64}$/;
const ENV_KEY_RE = /^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/;

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

  const out: DashboardServerDef = { id, label, port, npmScript };

  // workdir optionnel
  if (o.workdir != null) {
    const wd = String(o.workdir).trim().replace(/\\/g, '/').replace(/^\//, '').replace(/\/$/, '');
    if (wd && WORKDIR_RE.test(wd)) out.workdir = wd;
  }

  // commande custom optionnelle
  if (o.command != null) {
    const cmd = String(o.command).trim();
    if (cmd && COMMAND_RE.test(cmd)) out.command = cmd;
  }

  // variables d'env optionnelles
  if (o.env != null && typeof o.env === 'object' && !Array.isArray(o.env)) {
    const envObj = o.env as Record<string, unknown>;
    const sanitizedEnv: Record<string, string> = {};
    let envCount = 0;
    for (const [k, v] of Object.entries(envObj)) {
      if (envCount >= 20) break;
      if (!ENV_KEY_RE.test(k)) continue;
      const val = String(v ?? '').slice(0, 1024);
      sanitizedEnv[k] = val;
      envCount++;
    }
    if (Object.keys(sanitizedEnv).length > 0) out.env = sanitizedEnv;
  }

  return out;
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

export function readPackageScripts(
  projectPath: string,
  workdir?: string
): { name?: string; scripts: string[] } {
  const effectivePath = workdir
    ? path.resolve(path.join(projectPath, workdir))
    : projectPath;
  const pkgPath = path.join(effectivePath, 'package.json');
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

/**
 * Détecte automatiquement les serveurs possibles dans le projet :
 * - Racine du projet
 * - Sous-dossiers de profondeur 1 et 2 contenant un package.json
 * Retourne une liste de suggestions DashboardServerDef avec des ports par défaut.
 */
export function detectProjectServers(projectPath: string): DashboardServerDef[] {
  const suggestions: DashboardServerDef[] = [];
  const DEFAULT_PORTS: Record<string, number> = {
    dev: 3000, start: 3000, serve: 3000,
    backend: 8000, server: 8000, api: 8000,
    client: 3001, frontend: 3001, web: 3001,
  };
  const usedPorts = new Set<number>();

  function nextPort(preferred: number): number {
    let p = preferred;
    while (usedPorts.has(p)) p++;
    usedPorts.add(p);
    return p;
  }

  function scanDir(absDir: string, relDir: string | undefined) {
    const pkgPath = path.join(absDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return;
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const scripts: string[] = pkg.scripts ? Object.keys(pkg.scripts).filter((k) => SCRIPT_RE.test(k)) : [];
      const PRIORITY = ['dev', 'start', 'serve', 'backend', 'server', 'api', 'client', 'frontend', 'web'];
      const relevant = [
        ...PRIORITY.filter((s) => scripts.includes(s)),
        ...scripts.filter((s) => !PRIORITY.includes(s) && (s.includes('dev') || s.includes('start') || s.includes('serve'))),
      ].slice(0, 3);

      for (const script of relevant) {
        const preferred = DEFAULT_PORTS[script] ?? 3000;
        const port = nextPort(preferred);
        const folderLabel = relDir ? path.basename(relDir) : path.basename(projectPath);
        const label = relDir ? `${folderLabel} — ${script}` : script;
        suggestions.push({
          id: `auto-${relDir ? relDir.replace(/[^a-zA-Z0-9]/g, '-') + '-' : ''}${script}`,
          label,
          port,
          npmScript: script,
          ...(relDir ? { workdir: relDir } : {}),
        });
      }
    } catch {
      /* ignore */
    }
  }

  // Racine
  scanDir(projectPath, undefined);

  // Sous-dossiers profondeur 1
  try {
    const entries = fs.readdirSync(projectPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const absSubDir = path.join(projectPath, entry.name);
      scanDir(absSubDir, entry.name);

      // Profondeur 2
      try {
        const subEntries = fs.readdirSync(absSubDir, { withFileTypes: true });
        for (const sub of subEntries) {
          if (!sub.isDirectory()) continue;
          if (sub.name.startsWith('.') || sub.name === 'node_modules') continue;
          const rel = `${entry.name}/${sub.name}`;
          scanDir(path.join(absSubDir, sub.name), rel);
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }

  return suggestions;
}
