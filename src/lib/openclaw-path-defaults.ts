import fs from 'node:fs';
import path from 'node:path';
import { getConfig, type ForgeConfig } from './config-db';
import { readOpenClawLocalConfigFile } from './openclaw-gateway';
import { probeOpenClawContainerPath, type OpenClawDockerMount } from './openclaw-docker-mounts';

function inferDockerAppDataDirFromOpenclawPath(configPath: string): string | null {
  const norm = configPath.replace(/\\/g, '/');
  const lower = norm.toLowerCase();
  const idx = lower.lastIndexOf('/openclaw/openclaw.json');
  if (idx <= 0) return null;
  return norm.slice(0, idx).replace(/\/$/, '') || null;
}

function pickExistingDir(candidates: string[]): string | null {
  for (const c of candidates) {
    const t = c.trim();
    if (!t) continue;
    try {
      if (fs.existsSync(t) && fs.statSync(t).isDirectory()) return t;
    } catch {
      /* ignore fs errors */
    }
  }
  return null;
}

function inferDockerYamlDirFromAppData(appDataDir: string): string {
  const base = appDataDir.replace(/\\/g, '/').replace(/\/$/, '');
  const candidates = [
    `${base}/compose`,
    `${base}/docker/compose`,
    `${base}/stacks`,
    `${base}/openclaw/compose`,
    `${base}/openclaw`,
    base,
  ];
  return pickExistingDir(candidates) ?? candidates[0];
}

function mountScore(mount: OpenClawDockerMount): number {
  if (mount.type !== 'bind') return -100;
  const host = String(mount.source || '').trim().replace(/\\/g, '/').toLowerCase();
  const dest = String(mount.destination || '').trim().replace(/\\/g, '/').toLowerCase();
  if (!host || !dest) return -100;

  let score = 0;
  if (/(^|\/)(github|git|repos|projects|workspace)(\/|$)/.test(host)) score += 50;
  if (/(^|\/)(github|git|repos|projects|workspace)(\/|$)/.test(dest)) score += 25;
  if (/(^|\/)(appdata|openclaw)(\/|$)/.test(host)) score -= 30;
  if (/(^|\/)(data|mnt|media)(\/|$)/.test(host)) score += 15;
  return score;
}

function inferForgeReposRootFromMounts(mounts: OpenClawDockerMount[]): string | null {
  const sorted = [...mounts].sort((a, b) => mountScore(b) - mountScore(a));
  const best = sorted.find((m) => mountScore(m) > 0);
  return best?.source?.trim() || null;
}

export async function inferOpenClawBackedPathDefaults(): Promise<Partial<ForgeConfig>> {
  const out: Partial<ForgeConfig> = {};
  const local = await readOpenClawLocalConfigFile();
  const appDataDb = (await getConfig('dockerAppDataDir')).trim();
  const appDataInferred = local?.path ? inferDockerAppDataDirFromOpenclawPath(local.path) : null;
  const appData = appDataDb || appDataInferred || '';

  if (!appDataDb && appDataInferred) out.dockerAppDataDir = appDataInferred;

  const yamlDb = (await getConfig('dockerYamlDir')).trim();
  if (!yamlDb && appData) out.dockerYamlDir = inferDockerYamlDirFromAppData(appData);

  const reposDb = (await getConfig('forgeReposRoot')).trim();
  if (!reposDb) {
    const pathToTest = appData || path.resolve('.');
    const probe = await probeOpenClawContainerPath({ pathToTest });
    const repos = inferForgeReposRootFromMounts(probe.mounts ?? []);
    if (repos) out.forgeReposRoot = repos;
  }

  return out;
}
