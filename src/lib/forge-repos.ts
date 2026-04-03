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

/**
 * Slug URL / dossier : préfère le dernier segment du path DB (casse réelle du dossier),
 * sinon le name. Évite Tesla dans l'URL quand le dossier est `tesla`.
 */
export function repoSlugFromProject(project: { name: string; path?: string | null }): string {
  const rawPath = project.path != null ? String(project.path).trim() : '';
  if (rawPath) {
    const base = path.basename(rawPath.replace(/[/\\]+$/, ''));
    if (base && isSafeRepoDirName(base)) return base;
  }
  return project.name;
}

/**
 * Résout le projet même si la casse du paramètre URL ne correspond pas au dossier (Linux).
 */
export function resolveProjectPathVariants(appKey: string): string | null {
  if (!isSafeRepoDirName(appKey)) return null;
  const direct = resolveProjectPath(appKey);
  if (direct) return direct;
  const lower = appKey.toLowerCase();
  if (lower !== appKey) {
    const p = resolveProjectPath(lower);
    if (p) return p;
  }
  const root = path.resolve(getReposRoot());
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const want = appKey.toLowerCase();
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!isSafeRepoDirName(e.name)) continue;
      if (e.name.toLowerCase() !== want) continue;
      return resolveProjectPath(e.name);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Résout le dossier projet à partir d'une ligne Astro DB (path absolu + repli slug / root).
 * Indispensable quand FORGE_REPOS_ROOT ne correspond pas au préfixe enregistré en base.
 */
export function resolveProjectPathFromDbProject(project: {
  name: string;
  path?: string | null;
}): string | null {
  const root = path.resolve(getReposRoot());
  const raw = project.path != null ? String(project.path).trim() : '';
  if (raw) {
    try {
      const resolved = path.resolve(raw.replace(/[/\\]+$/, ''));
      if (fs.existsSync(resolved)) {
        const st = fs.statSync(resolved);
        if (st.isDirectory()) {
          let canonical = resolved;
          try {
            canonical = fs.realpathSync(resolved);
          } catch {
            /* garder resolved */
          }
          const rel = path.relative(root, canonical);
          if ((!rel.startsWith('..') && !path.isAbsolute(rel)) || rel === '') {
            return canonical;
          }
          const base = path.basename(canonical);
          const underRoot = resolveProjectPathVariants(base);
          if (underRoot) return underRoot;
          if (isSafeRepoDirName(base)) {
            return canonical;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
  return resolveProjectPathVariants(repoSlugFromProject(project));
}

