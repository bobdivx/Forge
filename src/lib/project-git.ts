// @ts-nocheck
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';

/** Statut d'un fichier touché par un commit (équivalent git --name-status). */
export type GitFileChange = {
  /** A=ajout, M=modif, D=supp, R=renommé, C=copié, T=type, U=non fusionné, X=inconnu */
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | 'X';
  /** Chemin du fichier (cible si renommé). */
  path: string;
  /** Chemin source (uniquement pour R / C). */
  oldPath?: string;
};

export type GitCommit = {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  dateIso: string;
  subject: string;
  /** Liste structurée des fichiers touchés (peut être vide si non chargée). */
  files?: GitFileChange[];
};

export type GitSummary = {
  isRepo: boolean;
  branch: string | null;
  dirty: boolean;
  aheadBehind: string | null;
  error: string | null;
};

/** Modifications encore non commitées : indexées (staged), non indexées (unstaged), non suivies. */
export type WorkingTreeChange = GitFileChange & {
  /** 'staged' = prêt à commit, 'unstaged' = arbre de travail, 'untracked' = nouveau, 'conflict' = fusion en cours. */
  area: 'staged' | 'unstaged' | 'untracked' | 'conflict';
};

export type WorkingTreeSnapshot = {
  isRepo: boolean;
  changes: WorkingTreeChange[];
  /** Date la plus récente de modification observée sur disque (ISO). Sert d'ancrage temporel pour la timeline. */
  lastChangeIso: string | null;
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
 * Quand `withFiles=true`, ajoute la liste structurée des fichiers touchés
 * (statut A/M/D/R + chemin) via `git log --name-status -z`.
 */
export function getGitCommits(
  projectPath: string,
  limit = 25,
  withFiles = false,
): { commits: GitCommit[]; error: string | null } {
  if (!isGitRepository(projectPath)) {
    return { commits: [], error: 'Pas de dépôt Git' };
  }
  if (!withFiles) {
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

  // Avec fichiers : on utilise le séparateur NUL (-z) qui rend le parsing robuste.
  // Format de chaque commit (puis NUL) :
  //   <HEADER>NUL<file_status_block_avec_NUL>NUL
  // où HEADER = HASH\x1FAUTHOR\x1FDATE\x1FSUBJECT
  const headSep = '\x1f';
  const headerFmt = `%H${headSep}%an${headSep}%aI${headSep}%s`;
  try {
    const out = runGit(
      projectPath,
      ['log', `-${limit}`, '-z', '--name-status', `--format=${headerFmt}`],
      30000,
    );
    if (!out) return { commits: [], error: null };

    const commits: GitCommit[] = [];
    // Split par NUL ; chaque commit produit une séquence : [header, file1, file2, ...] (file1 peut être "")
    const tokens = out.split('\x00');
    let i = 0;
    while (i < tokens.length) {
      const header = tokens[i++];
      if (!header || !header.includes(headSep)) continue;
      const parts = header.split(headSep);
      if (parts.length < 4) continue;
      const [hash, author, dateIso, ...rest] = parts;
      const subject = rest.join(headSep);

      const files: GitFileChange[] = [];
      // Les fichiers suivent jusqu'à un token vide ou un nouveau header (qui contient des sep).
      while (i < tokens.length) {
        const t = tokens[i];
        if (t === '') {
          i += 1;
          break;
        }
        if (t && t.includes(headSep)) break; // nouveau header
        if (!t) {
          i += 1;
          continue;
        }
        // statut + chemin(s) — pour R/C : "R100\x00oldPath\x00newPath" (déjà splitté)
        const statusPart = t.trim();
        const code = statusPart[0] as GitFileChange['status'];
        if (code === 'R' || code === 'C') {
          i += 1;
          const oldPath = tokens[i++] ?? '';
          const newPath = tokens[i++] ?? '';
          files.push({ status: code, path: newPath, oldPath });
        } else {
          i += 1;
          const filePath = tokens[i++] ?? '';
          files.push({ status: code || 'X', path: filePath });
        }
      }

      commits.push({
        hash,
        shortHash: hash.slice(0, 7),
        author: author || '—',
        date: dateIso ? new Date(dateIso).toLocaleString('fr-FR') : '—',
        dateIso: dateIso || '',
        subject: subject || '(sans message)',
        files,
      });
    }
    return { commits, error: null };
  } catch (e: any) {
    return { commits: [], error: e?.message || 'Échec git log' };
  }
}

function statusCharToCode(ch: string): GitFileChange['status'] {
  const c = (ch || '').toUpperCase();
  if (c === 'A' || c === 'M' || c === 'D' || c === 'R' || c === 'C' || c === 'T' || c === 'U') return c;
  if (c === '?') return 'A'; // sera marqué untracked via `area`
  return 'X';
}

/**
 * Snapshot des modifications non commitées (staged + unstaged + untracked).
 * Repose sur `git status --porcelain=v1 -z` qui fournit un format stable.
 */
export function getWorkingTreeChanges(projectPath: string): WorkingTreeSnapshot {
  if (!isGitRepository(projectPath)) {
    return { isRepo: false, changes: [], lastChangeIso: null, error: 'Pas de dépôt Git' };
  }
  let raw: string;
  try {
    raw = runGit(projectPath, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], 15000);
  } catch (e: any) {
    return { isRepo: true, changes: [], lastChangeIso: null, error: e?.message || 'git status KO' };
  }
  const tokens = raw.split('\x00');
  const out: WorkingTreeChange[] = [];
  let lastChangeMs = 0;

  function noteFsTime(relPath: string) {
    try {
      const full = path.join(projectPath, relPath);
      const st = fs.statSync(full);
      const t = st.mtimeMs;
      if (Number.isFinite(t) && t > lastChangeMs) lastChangeMs = t;
    } catch {
      /* fichier supprimé : pas de mtime */
    }
  }

  let i = 0;
  while (i < tokens.length) {
    const entry = tokens[i++];
    if (!entry) continue;
    // entry: "XY path" (X=index, Y=worktree). Pour R/C : suivi d'un \0 puis ancien chemin.
    if (entry.length < 3) continue;
    const x = entry[0];
    const y = entry[1];
    const filePath = entry.slice(3);
    let oldPath: string | undefined;

    if (x === 'R' || x === 'C' || y === 'R' || y === 'C') {
      oldPath = tokens[i++] ?? '';
    }

    // Conflit : both modified / added / deleted etc. (caractères identiques non-espace).
    if ((x === 'U' || y === 'U') || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
      out.push({ area: 'conflict', status: 'U', path: filePath, oldPath });
      noteFsTime(filePath);
      continue;
    }

    // Untracked : "?? path"
    if (x === '?' && y === '?') {
      out.push({ area: 'untracked', status: 'A', path: filePath });
      noteFsTime(filePath);
      continue;
    }

    // Index column (staged) — non-espace et non '?'
    if (x !== ' ' && x !== '?') {
      out.push({ area: 'staged', status: statusCharToCode(x), path: filePath, oldPath });
      noteFsTime(filePath);
    }
    // Worktree column (unstaged) — non-espace et non '?'
    if (y !== ' ' && y !== '?') {
      out.push({ area: 'unstaged', status: statusCharToCode(y), path: filePath, oldPath });
      noteFsTime(filePath);
    }
  }

  return {
    isRepo: true,
    changes: out,
    lastChangeIso: lastChangeMs > 0 ? new Date(lastChangeMs).toISOString() : null,
    error: null,
  };
}
