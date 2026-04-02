// @ts-nocheck
import fs from 'fs';
import path from 'path';

/** Racine des dépôts (NAS). Surcharge : FORGE_REPOS_ROOT */
export function getReposRoot(): string {
  return process.env.FORGE_REPOS_ROOT?.trim() || '/media/Github';
}

const SAFE_NAME = /^[a-zA-Z0-9._-]{1,128}$/;

export function isSafeRepoDirName(name: string): boolean {
  return Boolean(name && SAFE_NAME.test(name));
}

/**
 * Résout le chemin du projet et empêche la sortie du répertoire racine (path traversal).
 */
export function resolveProjectPath(appName: string): string | null {
  if (!isSafeRepoDirName(appName)) return null;
  const root = path.resolve(getReposRoot());
  const full = path.resolve(path.join(root, appName));
  const rel = path.relative(root, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  try {
    if (!fs.existsSync(full)) return null;
    if (!fs.statSync(full).isDirectory()) return null;
    return full;
  } catch {
    return null;
  }
}

export function forgeRequestsFile(projectPath: string): string {
  return path.join(projectPath, '.forge', 'demandes.json');
}
