import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import path from 'node:path';
import { getReposRootResolved } from '../../lib/forge-repos';
import { loadAstroDb } from '../../lib/load-astro-db';
import fs from 'fs';

export const POST: APIRoute = async () => {
  const { db, Project } = await loadAstroDb();
  const reposRoot = await getReposRootResolved();

  if (!fs.existsSync(reposRoot)) {
    return new Response(
      JSON.stringify({ ok: false, error: `Dossier introuvable : ${reposRoot}` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const dirs = fs.readdirSync(reposRoot).filter(d => {
    try { return fs.statSync(path.join(reposRoot, d)).isDirectory(); } catch { return false; }
  });

  const results: { name: string; status: string }[] = [];

  for (const dirName of dirs) {
    const fullPath = path.join(reposRoot, dirName);
    if (!fs.existsSync(path.join(fullPath, '.git'))) continue;

    try {
      const existing = await db.select().from(Project).where(eq(Project.name, dirName)).limit(1);
      if (existing.length) {
        const row = existing[0];
        const samePath = String(row.path ?? '') === fullPath;
        if (!samePath) {
          await db
            .update(Project)
            .set({ path: fullPath, updatedAt: new Date() })
            .where(eq(Project.id, row.id));
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
        description: 'Dépôt détecté automatiquement',
      });
      results.push({ name: dirName, status: 'added' });
    } catch {
      results.push({ name: dirName, status: 'error' });
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
