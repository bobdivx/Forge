/**
 * Diagnostic du répertoire des applications (`forgeReposRoot`).
 * Forge lit ce chemin sur **son** hôte ; ZimaOS doit monter le même stockage pour les agents.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getReposRootResolved } from './forge-repos';

export type ForgeReposHealth = {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  readable: boolean;
  gitReposFound: number;
  /** Synthèse pour l’UI */
  status: 'ok' | 'missing' | 'not_dir' | 'unreadable' | 'empty';
  /** Texte court pour bannière */
  summary: string;
};

function countGitRepos(root: string): number {
  let n = 0;
  try {
    const names = fs.readdirSync(root);
    for (const name of names) {
      const full = path.join(root, name);
      try {
        if (fs.statSync(full).isDirectory() && fs.existsSync(path.join(full, '.git'))) n++;
      } catch {
        /* skip */
      }
    }
  } catch {
    return 0;
  }
  return n;
}

export async function getForgeReposRootHealth(): Promise<ForgeReposHealth> {
  const raw = await getReposRootResolved();
  const resolved = path.resolve(raw);

  if (!fs.existsSync(resolved)) {
    return {
      path: resolved,
      exists: false,
      isDirectory: false,
      readable: false,
      gitReposFound: 0,
      status: 'missing',
      summary: `Le chemin n’existe pas sur cette machine (${resolved}).`,
    };
  }

  let isDir = false;
  let readable = false;
  try {
    const st = fs.statSync(resolved);
    isDir = st.isDirectory();
    readable = true;
    if (isDir) fs.readdirSync(resolved);
  } catch {
    readable = false;
  }

  if (!isDir) {
    return {
      path: resolved,
      exists: true,
      isDirectory: false,
      readable,
      gitReposFound: 0,
      status: 'not_dir',
      summary: `Ce chemin existe mais n’est pas un dossier (${resolved}).`,
    };
  }

  if (!readable) {
    return {
      path: resolved,
      exists: true,
      isDirectory: true,
      readable: false,
      gitReposFound: 0,
      status: 'unreadable',
      summary: `Lecture impossible (droits ou erreur disque) : ${resolved}`,
    };
  }

  const gitReposFound = countGitRepos(resolved);
  const status = gitReposFound === 0 ? 'empty' : 'ok';
  const summary =
    gitReposFound === 0
      ? `Dossier accessible mais aucun dépôt Git détecté à la racine (${resolved}).`
      : `${gitReposFound} dépôt(s) Git sous ce répertoire.`;

  return {
    path: resolved,
    exists: true,
    isDirectory: true,
    readable: true,
    gitReposFound,
    status,
    summary,
  };
}

/** Validation avant écriture Config : refuse un chemin invalide sauf override env. */
export function validateForgeReposRootForSave(candidate: string): { ok: true } | { ok: false; error: string } {
  if (process.env.FORGE_SKIP_REPOS_ROOT_VALIDATION?.trim() === '1') {
    return { ok: true };
  }
  const trimmed = candidate.trim();
  if (!trimmed) return { ok: true };

  const resolved = path.resolve(trimmed);
  if (!fs.existsSync(resolved)) {
    return {
      ok: false,
      error: `Forge ne trouve pas ce dossier sur ce serveur : ${resolved}. Vérifiez le chemin ou le montage Docker de l’application Forge.`,
    };
  }
  try {
    if (!fs.statSync(resolved).isDirectory()) {
      return { ok: false, error: `Le chemin n’est pas un dossier : ${resolved}` };
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Erreur fs';
    return { ok: false, error: `Impossible de vérifier le dossier : ${msg}` };
  }
  return { ok: true };
}
