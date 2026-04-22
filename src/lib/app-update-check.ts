import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { getConfig } from './config-db';

const execFileAsync = promisify(execFile);
const GITHUB_API = 'https://api.github.com';
const CACHE_TTL_MS = 10 * 60 * 1000;

type GithubLatestRelease = {
  tag_name?: unknown;
  html_url?: unknown;
  published_at?: unknown;
};

export type AppUpdateInfo = {
  ok: boolean;
  checkedAt: string;
  currentVersion: string;
  repository: string | null;
  latestVersion: string | null;
  latestTag: string | null;
  latestUrl: string | null;
  publishedAt: string | null;
  updateAvailable: boolean;
  error?: string;
};

let cache: { expiresAt: number; data: AppUpdateInfo } | null = null;

function normalizeTag(v: string): string {
  return v.replace(/^v/i, '').trim();
}

function parseSemverLoose(input: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i.exec(input.trim());
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a: string, b: string): number {
  const sa = parseSemverLoose(a);
  const sb = parseSemverLoose(b);
  if (!sa || !sb) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (sa[i]! > sb[i]!) return 1;
    if (sa[i]! < sb[i]!) return -1;
  }
  return 0;
}

async function readCurrentVersion(): Promise<string> {
  try {
    const root = new URL('../../', import.meta.url);
    const pkgUrl = new URL('package.json', root);
    const raw = await readFile(pkgUrl, 'utf-8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    const version = typeof parsed.version === 'string' ? parsed.version.trim() : '';
    return version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function parseGithubRepoFromRemote(remote: string): string | null {
  const value = remote.trim();
  if (!value) return null;
  const ssh = /^git@github\.com:([^/]+\/[^/]+?)(?:\.git)?$/i.exec(value);
  if (ssh) return ssh[1] ?? null;
  const https = /^https:\/\/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/i.exec(value);
  if (https) return https[1] ?? null;
  return null;
}

async function resolveGithubRepository(): Promise<string | null> {
  const envRepo = String(process.env.FORGE_GITHUB_REPOSITORY || '').trim();
  if (envRepo) return envRepo.replace(/^github\.com\//i, '');
  try {
    const { stdout } = await execFileAsync('git', ['config', '--get', 'remote.origin.url'], { timeout: 2_000 });
    return parseGithubRepoFromRemote(String(stdout || ''));
  } catch {
    return null;
  }
}

function buildAuthHeaders(token: string): Record<string, string> {
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export async function getAppUpdateInfo(options?: { force?: boolean }): Promise<AppUpdateInfo> {
  const force = Boolean(options?.force);
  const now = Date.now();
  if (!force && cache && cache.expiresAt > now) {
    return cache.data;
  }

  const currentVersion = await readCurrentVersion();
  const repository = await resolveGithubRepository();
  if (!repository) {
    const noRepo: AppUpdateInfo = {
      ok: false,
      checkedAt: new Date().toISOString(),
      currentVersion,
      repository: null,
      latestVersion: null,
      latestTag: null,
      latestUrl: null,
      publishedAt: null,
      updateAvailable: false,
      error: 'Repo GitHub introuvable (définir FORGE_GITHUB_REPOSITORY ou origin remote).',
    };
    cache = { data: noRepo, expiresAt: now + CACHE_TTL_MS };
    return noRepo;
  }

  const token = String(process.env.GITHUB_TOKEN || '').trim() || String((await getConfig('githubToken')) || '').trim();
  try {
    const res = await fetch(`${GITHUB_API}/repos/${repository}/releases/latest`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'forge-dashboard',
        ...buildAuthHeaders(token),
      },
    });
    if (!res.ok) {
      throw new Error(`GitHub API HTTP ${res.status}`);
    }
    const json = (await res.json()) as GithubLatestRelease;
    const latestTag = typeof json.tag_name === 'string' ? json.tag_name.trim() : '';
    const latestVersion = normalizeTag(latestTag);
    const updateAvailable =
      Boolean(latestVersion) && compareSemver(latestVersion, normalizeTag(currentVersion)) > 0;

    const data: AppUpdateInfo = {
      ok: true,
      checkedAt: new Date().toISOString(),
      currentVersion,
      repository,
      latestVersion: latestVersion || null,
      latestTag: latestTag || null,
      latestUrl: typeof json.html_url === 'string' ? json.html_url : null,
      publishedAt: typeof json.published_at === 'string' ? json.published_at : null,
      updateAvailable,
    };
    cache = { data, expiresAt: now + CACHE_TTL_MS };
    return data;
  } catch (e: unknown) {
    const data: AppUpdateInfo = {
      ok: false,
      checkedAt: new Date().toISOString(),
      currentVersion,
      repository,
      latestVersion: null,
      latestTag: null,
      latestUrl: null,
      publishedAt: null,
      updateAvailable: false,
      error: e instanceof Error ? e.message : 'Impossible de vérifier les releases GitHub.',
    };
    cache = { data, expiresAt: now + CACHE_TTL_MS };
    return data;
  }
}
