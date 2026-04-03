import { resolve } from 'node:path';

/**
 * Racine du dépôt Forge sur la machine qui exécute Astro (projet à la racine du repo).
 * Si le serveur est encore lancé depuis un sous-dossier `dashboard`, remonte d’un cran.
 */
export function getForgeRepoRoot(): string {
  const cwd = process.cwd();
  const leaf = cwd.replace(/[/\\]+$/, '').split(/[/\\]/).pop();
  return leaf === 'dashboard' ? resolve(cwd, '..') : cwd;
}
