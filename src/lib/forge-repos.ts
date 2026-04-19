// @ts-nocheck
import fs from 'fs';
import path from 'path';
import { getConfig } from './config-db';

/**
 * Chemins courants selon l’hôte (Zima/NAS) vs conteneur Docker.
 */
const DEFAULT_REPOS_ROOT_CANDIDATES = ['/mnt/GitHub', '/media/GitHub', '/media/Github'] as const;

function resolveReposRootSync(preferred: Array<string | undefined>): string {
  for (const p of preferred) {
    const t = typeof p === 'string' ? p.trim() : '';
    if (t && fs.existsSync(t)) return path.resolve(t);
  }
  for (const c of DEFAULT_REPOS_ROOT_CANDIDATES) {
    if (fs.existsSync(c)) return path.resolve(c);
  }
  const fallback =
    preferred.map((p) => (typeof p === 'string' ? p.trim() : '')).find(Boolean) ||
    DEFAULT_REPOS_ROOT_CANDIDATES[0];
  return path.resolve(fallback);
}

/** Répertoire des applications sur disque (un sous-dossier = une app). Surcharge : FORGE_REPOS_ROOT */
export function getReposRoot(): string {
  return resolveReposRootSync([process.env.FORGE_REPOS_ROOT]);
}

/**
 * Ordre : base (Paramètres utilisateur), puis FORGE_REPOS_ROOT (compose),
 * puis les chemins usuels qui existent.
 */
export async function getReposRootResolved(): Promise<string> {
  let fromDb = '';
  try {
    fromDb = (await getConfig('forgeReposRoot')).trim();
  } catch {
    /* ignore */
  }
  return resolveReposRootSync([fromDb, process.env.FORGE_REPOS_ROOT]);
}

/** Racine des dépôts telle que vue par l'agent (ex: /mnt/GitHub sur le NAS). */
export async function getAgentReposRootResolved(): Promise<string> {
  try {
    const fromDb = (await getConfig('forgeReposRootAgent')).trim();
    if (fromDb) return fromDb;
  } catch {
    /* ignore */
  }
  return '/mnt/GitHub';
}

/**
 * Traduit un chemin local (ex: Z:\Forge\src) en chemin agent (ex: /mnt/GitHub/Forge/src).
 */
export async function toAgentPath(localPath: string): Promise<string> {
  if (!localPath) return localPath;
  const localRoot = await getReposRootResolved();
  const agentRoot = await getAgentReposRootResolved();

  // On normalise les deux racines pour la comparaison
  const normLocalRoot = path.resolve(localRoot).toLowerCase();
  const normPath = path.resolve(localPath).toLowerCase();

  if (normPath.startsWith(normLocalRoot)) {
    const relativePart = path.relative(normLocalRoot, normPath);
    // On rejoint avec la racine agent et on force les slashes Linux
    return path.join(agentRoot, relativePart).replace(/\\/g, '/');
  }

  // Si on est déjà dans un format agent (ou hors racine), on normalise juste les slashes
  return localPath.replace(/\\/g, '/');
}

/**
 * Remplace toutes les occurrences du chemin racine local par le chemin racine agent dans un texte.
 * Utile pour traduire les instructions de tâches contenant des chemins absolus.
 */
export async function translateContentForAgent(content: string): Promise<string> {
  if (!content) return content;
  const localRoot = await getReposRootResolved();
  const agentRoot = await getAgentReposRootResolved();

  // On normalise pour la recherche (on garde la casse originale pour le remplacement si possible, 
  // mais ici on va faire simple avec un replace global)
  const normLocal = localRoot.replace(/\\/g, '/').toLowerCase();
  
  let out = content.replace(/\\/g, '/'); // Force forward slashes first
  
  // Remplacement insensible à la casse pour la racine
  const regex = new RegExp(normLocal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  return out.replace(regex, agentRoot);
}

const SAFE_NAME = /^[a-zA-Z0-9._-]{1,128}$/;

export function isSafeRepoDirName(name: string): boolean {
  return Boolean(name && SAFE_NAME.test(name));
}

/**
 * Résout le chemin du projet et empêche la sortie du répertoire racine (path traversal).
 * Utilise la racine Paramètres / Astro DB (`forgeReposRoot`), pas seulement l’env.
 */
export async function resolveProjectPath(appName: string): Promise<string | null> {
  if (!isSafeRepoDirName(appName)) return null;
  const root = path.resolve(await getReposRootResolved());
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
export async function resolveProjectPathVariants(appKey: string): Promise<string | null> {
  if (!isSafeRepoDirName(appKey)) return null;
  const direct = await resolveProjectPath(appKey);
  if (direct) return direct;
  const lower = appKey.toLowerCase();
  if (lower !== appKey) {
    const p = await resolveProjectPath(lower);
    if (p) return p;
  }
  const root = path.resolve(await getReposRootResolved());
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    const want = appKey.toLowerCase();
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (!isSafeRepoDirName(e.name)) continue;
      if (e.name.toLowerCase() !== want) continue;
      return await resolveProjectPath(e.name);
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Résout le dossier projet à partir d'une ligne Astro DB (path absolu + repli slug / root).
 * Indispensable quand la racine en base (Paramètres) ne correspond pas au path enregistré.
 */
export async function resolveProjectPathFromDbProject(project: {
  name: string;
  path?: string | null;
}): Promise<string | null> {
  const root = path.resolve(await getReposRootResolved());
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
          const underRoot = await resolveProjectPathVariants(base);
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

/**
 * Chemins absolus de chaque dépôt applicatif directement sous la racine Forge
 * (un sous-dossier = une app). Utilisé pour corréler ports / PID entre projets.
 */
export async function listRepoProjectPaths(): Promise<string[]> {
  const root = path.resolve(await getReposRootResolved());
  const out: string[] = [];
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || !isSafeRepoDirName(e.name)) continue;
      const full = path.resolve(path.join(root, e.name));
      try {
        if (fs.statSync(full).isDirectory()) out.push(full);
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

