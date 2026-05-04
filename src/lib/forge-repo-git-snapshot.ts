/**
 * Instantané Git local pour un dossier dépôt (machine qui exécute Forge).
 * Utilisé pour compléter les heuristiques « commit / push » basées sur le texte agent.
 */

import { spawn } from 'node:child_process';

export type RepoGitSnapshot = {
  ok: boolean;
  /** Chemin résolu du dépôt */
  repoPath?: string;
  error?: string;
  branch?: string | null;
  /** Branche distante suivie, ex. origin/main */
  tracking?: string | null;
  /** Commits locaux non poussés (si suivi amont connu) */
  ahead?: number | null;
  /** Commits distants non fusionnés */
  behind?: number | null;
  /** Aucune modification dans l’arbre de travail */
  worktreeClean?: boolean | null;
  /** Nombre de lignes porcelain (fichiers modifiés / ajoutés / etc.) */
  changedFiles?: number | null;
  /** Dernier commit sur HEAD */
  lastCommit?: string | null;
  /** Au moins un remote nommé */
  hasRemote?: boolean | null;
};

function runGit(cwd: string, args: string[], timeoutMs = 7000): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    const child = spawn('git', args, { cwd, shell: false, windowsHide: true, timeout: timeoutMs });
    child.stdout?.on('data', (c: Buffer) => chunks.push(c));
    child.stderr?.on('data', (c: Buffer) => errChunks.push(c));
    child.on('error', () => {
      resolve({ code: 1, out: Buffer.concat(errChunks).toString('utf8').trim() });
    });
    child.on('close', (code) => {
      const stdout = Buffer.concat(chunks).toString('utf8');
      const stderr = Buffer.concat(errChunks).toString('utf8');
      const out = (stdout + (stderr && code !== 0 ? `\n${stderr}` : '')).trim();
      resolve({ code: code ?? 1, out });
    });
  });
}

function parseStatusSb(firstLine: string): {
  branch: string | null;
  tracking: string | null;
  ahead: number | null;
  behind: number | null;
} {
  let branch: string | null = null;
  let tracking: string | null = null;
  let ahead: number | null = null;
  let behind: number | null = null;
  const line = String(firstLine || '').trim();
  if (!line.startsWith('## ')) return { branch, tracking, ahead, behind };
  const rest = line.slice(3);
  if (/^HEAD \(detached/i.test(rest)) {
    const m = rest.match(/at\s+([0-9a-f]+)/i);
    branch = m?.[1] ? `detached:${m[1].slice(0, 7)}` : 'detached';
    return { branch, tracking, ahead, behind };
  }
  const trackSep = rest.indexOf('...');
  if (trackSep === -1) {
    const space = rest.search(/\s/);
    branch = space === -1 ? rest : rest.slice(0, space);
    const ab = rest.match(/\[ahead (\d+)(?:,\s*behind (\d+))?\]/);
    if (ab) {
      ahead = Number(ab[1]);
      behind = ab[2] != null ? Number(ab[2]) : null;
    }
    return { branch, tracking, ahead, behind };
  }
  branch = rest.slice(0, trackSep);
  const afterTrack = rest.slice(trackSep + 3);
  const bracket = afterTrack.indexOf(' [');
  const trackPart = bracket === -1 ? afterTrack.trim() : afterTrack.slice(0, bracket).trim();
  tracking = trackPart || null;
  const ab = rest.match(/\[ahead (\d+)(?:,\s*behind (\d+))?\]/);
  if (ab) {
    ahead = Number(ab[1]);
    behind = ab[2] != null ? Number(ab[2]) : null;
  }
  return { branch, tracking, ahead, behind };
}

/** Retourne un résumé Git pour le dossier `cwd` (doit être la racine du clone). */
export async function getRepoGitSnapshot(repoPath: string): Promise<RepoGitSnapshot> {
  const cwd = String(repoPath || '').trim();
  if (!cwd) return { ok: false, error: 'Chemin vide' };

  const inside = await runGit(cwd, ['rev-parse', '--is-inside-work-tree']);
  if (inside.code !== 0 || !/^true$/im.test(inside.out.trim())) {
    return { ok: false, repoPath: cwd, error: 'Pas un dépôt Git (rev-parse)' };
  }

  const rem = await runGit(cwd, ['remote', '-v']);
  const hasRemote = /\S/.test(rem.out);

  const st = await runGit(cwd, ['status', '-sb', '--porcelain=v1']);
  if (st.code !== 0) {
    return { ok: false, repoPath: cwd, error: st.out.slice(0, 200) || 'git status a échoué' };
  }

  const lines = st.out.split(/\r?\n/).filter((l) => l.length > 0);
  const first = lines[0] ?? '';
  const parsed = parseStatusSb(first);
  const porcelainBody = lines.slice(1);
  const changedFiles = porcelainBody.length;

  let ahead = parsed.ahead;
  let behind = parsed.behind;

  /** Commits derrière / devant la branche suivie (`@{u}`). Échoue sans amont — on garde alors le parsing `status`. */
  const lr = await runGit(cwd, ['rev-list', '--left-right', '--count', '@{u}...HEAD']);
  if (lr.code === 0) {
    const parts = lr.out.trim().split(/\t/);
    if (parts.length >= 2) {
      const left = Number(parts[0]);
      const right = Number(parts[1]);
      if (Number.isFinite(left) && Number.isFinite(right)) {
        behind = left;
        ahead = right;
      }
    }
  }

  const log1 = await runGit(cwd, ['log', '-1', '--oneline', '--no-decorate']);
  const lastCommit =
    log1.code === 0 && log1.out.trim() ? log1.out.trim().split('\n')[0]?.slice(0, 200) ?? null : null;

  const worktreeClean = changedFiles === 0;

  return {
    ok: true,
    repoPath: cwd,
    branch: parsed.branch,
    tracking: parsed.tracking,
    ahead: ahead ?? null,
    behind: behind ?? null,
    worktreeClean,
    changedFiles,
    lastCommit,
    hasRemote,
  };
}
