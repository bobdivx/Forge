import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import path from 'node:path';
import { getReposRootResolved } from '../../lib/forge-repos';
import { loadAstroDb } from '../../lib/load-astro-db';
import fs from 'fs';

export const POST: APIRoute = async ({ request }) => {
  const { db, Project } = await loadAstroDb();
  let reposRoot = await getReposRootResolved();

  /** Paramètres envoie ce champ dans le corps pour synchroniser avec le formulaire avant sauvegarde. */
  try {
    const ct = request.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) {
      const body = (await request.json()) as { forgeReposRoot?: string };
      const hint = typeof body?.forgeReposRoot === 'string' ? body.forgeReposRoot.trim() : '';
      if (hint && path.isAbsolute(hint)) reposRoot = path.resolve(hint);
    }
  } catch {
    /* corps absent ou invalide → getReposRootResolved */
  }

  if (!fs.existsSync(reposRoot)) {
    return new Response(
      JSON.stringify({ ok: false, error: `Dossier introuvable : ${reposRoot}` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const dirs = fs.readdirSync(reposRoot).filter(d => {
    try { return fs.statSync(path.join(reposRoot, d)).isDirectory(); } catch { return false; }
  });

  const results: { name: string; status: string; errorMessage?: string }[] = [];
  console.log(`[sync-projects] Scanned ${reposRoot}. Found directories: ${dirs.join(', ')}`);

  // ⚡ Bolt Performance Optimization:
  // Pre-fetch all existing projects to prevent N+1 query problem during directory synchronization.
  // This reduces O(N) database queries into a single query and O(1) in-memory map lookups.
  const allProjects = await db.select().from(Project);
  const projectsByName = new Map(allProjects.map((p) => [p.name, p]));

  for (const dirName of dirs) {
    const fullPath = path.join(reposRoot, dirName);
    const hasGit = fs.existsSync(path.join(fullPath, '.git'));
    if (!hasGit) {
      console.log(`[sync-projects] Skipping ${dirName}: no .git folder`);
      continue;
    }

    try {
      const existingRow = projectsByName.get(dirName);
      if (existingRow) {
        const samePath = String(existingRow.path ?? '') === fullPath;
        if (!samePath) {
          await db
            .update(Project)
            .set({ path: fullPath, updatedAt: new Date() })
            .where(eq(Project.id, existingRow.id));
          results.push({ name: dirName, status: 'path_updated' });
        } else {
          results.push({ name: dirName, status: 'exists' });
        }
        continue;
      }

      await db.insert(Project).values({
        name: dirName,
        path: fullPath,
        status: 'active',
        swarmEnabled: 1,
        description: 'Dépôt détecté automatiquement',
      });
      console.log(`[sync-projects] Added ${dirName}`);
      results.push({ name: dirName, status: 'added' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[sync-projects] Database error for element ${dirName}:`, msg);
      results.push({ name: dirName, status: 'error', errorMessage: msg });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, reposRoot, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

export const GET: APIRoute = async () => {
  const reposRoot = await getReposRootResolved();
  const exists = fs.existsSync(reposRoot);
  let dirs: string[] = [];
  if (exists) {
    dirs = fs.readdirSync(reposRoot).filter(d => {
      try {
        const p = path.join(reposRoot, d);
        return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, '.git'));
      } catch { return false; }
    });
  }
  return new Response(
    JSON.stringify({ reposRoot, exists, repos: dirs }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
