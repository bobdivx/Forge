// @ts-nocheck
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export type GitCommit = {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  dateIso: string;
  subject: string;
};

export type GitSummary = {
  isRepo: boolean;
  branch: string | null;
  dirty: boolean;
  aheadBehind: string | null;
  error: string | null;
};

function runGit(cwd: string, args: string[], timeout = 12000): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf-8',
    timeout,
    maxBuffer: 2 * 1024 * 1024,
    windowsHide: true,
  }).trim();
}

export function isGitRepository(projectPath: string): boolean {
  return fs.existsSync(path.join(projectPath, '.git'));
}

export function getGitSummary(projectPath: string): GitSummary {
  if (!isGitRepository(projectPath)) {
    return {
      isRepo: false,
      branch: null,
      dirty: false,
      aheadBehind: null,
      error: 'Pas de dépôt Git (.git absent)',
    };
  }
  try {
    const branch = runGit(projectPath, ['rev-parse', '--abbrev-ref', 'HEAD']);
    let dirty = false;
    try {
      const st = runGit(projectPath, ['status', '--porcelain']);
      dirty = st.length > 0;
    } catch {
      dirty = false;
    }
    let aheadBehind: string | null = null;
    try {
      const ab = runGit(projectPath, ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}']).split(
        /\s+/
      );
      if (ab.length === 2 && ab[0] !== '' && !Number.isNaN(Number(ab[0]))) {
        const behind = Number(ab[0]);
        const ahead = Number(ab[1]);
        if (ahead || behind) aheadBehind = `↑${ahead} ↓${behind}`;
      }
    } catch {
      aheadBehind = null;
    }
    return {
      isRepo: true,
      branch: branch || null,
      dirty,
      aheadBehind,
      error: null,
    };
  } catch (e: any) {
    return {
      isRepo: true,
      branch: null,
      dirty: false,
      aheadBehind: null,
      error: e?.message || 'git indisponible',
    };
  }
}

/**
 * Derniers commits (ordre chronologique inverse).
 */
export function getGitCommits(projectPath: string, limit = 25): { commits: GitCommit[]; error: string | null } {
  if (!isGitRepository(projectPath)) {
    return { commits: [], error: 'Pas de dépôt Git' };
  }
  const sep = '\x1e';
  const lineSep = '\x1f';
  const format = `%H${sep}%an${sep}%aI${sep}%s${lineSep}`;
  try {
    const out = runGit(projectPath, ['log', `-${limit}`, `--format=${format}`], 20000);
    if (!out) return { commits: [], error: null };
    const commits: GitCommit[] = [];
    for (const line of out.split(lineSep)) {
      const t = line.trim();
      if (!t) continue;
      const parts = t.split(sep);
      if (parts.length < 4) continue;
      const [hash, author, dateIso, ...rest] = parts;
      const subject = rest.join(sep);
      commits.push({
        hash,
        shortHash: hash.slice(0, 7),
        author: author || '—',
        date: dateIso ? new Date(dateIso).toLocaleString('fr-FR') : '—',
        dateIso: dateIso || '',
        subject: subject || '(sans message)',
      });
    }
    return { commits, error: null };
  } catch (e: any) {
    return { commits: [], error: e?.message || 'Échec git log' };
  }
}
