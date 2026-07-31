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

  try {
    // Optimization: Resolve N+1 query problem by fetching all projects in a single query
    // and using a Map for O(1) lookups instead of querying the DB in a loop.
    const allProjects = await db.select().from(Project);
    const projectMap = new Map(allProjects.map(p => [p.name, p]));

    const toInsert: any[] = [];
    const updatePromises: Promise<any>[] = [];

    for (const dirName of dirs) {
      const fullPath = path.join(reposRoot, dirName);
      const hasGit = fs.existsSync(path.join(fullPath, '.git'));
      if (!hasGit) {
        console.log(`[sync-projects] Skipping ${dirName}: no .git folder`);
        continue;
      }

      const row = projectMap.get(dirName);
      if (row) {
        const samePath = String(row.path ?? '') === fullPath;
        if (!samePath) {
          updatePromises.push(
            db.update(Project)
              .set({ path: fullPath, updatedAt: new Date() })
              .where(eq(Project.id, row.id))
          );
          results.push({ name: dirName, status: 'path_updated' });
        } else {
          results.push({ name: dirName, status: 'exists' });
        }
      } else {
        toInsert.push({
          name: dirName,
          path: fullPath,
          status: 'active',
          swarmEnabled: 1,
          description: 'Dépôt détecté automatiquement',
        });
        results.push({ name: dirName, status: 'added' });
      }
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    if (toInsert.length > 0) {
      await db.insert(Project).values(toInsert);
      console.log(`[sync-projects] Added ${toInsert.length} projects: ${toInsert.map(i => i.name).join(', ')}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[sync-projects] Batch database error:`, msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
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
