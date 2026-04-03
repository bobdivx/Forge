import type { APIRoute } from 'astro';
import { db, Project } from 'astro:db';
import { getReposRoot } from '../../lib/forge-repos';
import fs from 'fs';

export const POST: APIRoute = async () => {
  const reposRoot = getReposRoot();

  if (!fs.existsSync(reposRoot)) {
    return new Response(
      JSON.stringify({ ok: false, error: `Dossier introuvable : ${reposRoot}` }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const dirs = fs.readdirSync(reposRoot).filter(d => {
    try { return fs.statSync(`${reposRoot}/${d}`).isDirectory(); } catch { return false; }
  });

  const results: { name: string; status: string }[] = [];

  for (const dirName of dirs) {
    const fullPath = `${reposRoot}/${dirName}`;
    if (!fs.existsSync(`${fullPath}/.git`)) continue;

    try {
      await db.insert(Project).values({
        name: dirName,
        path: fullPath,
        status: 'active',
        description: 'Dépôt détecté automatiquement',
      });
      results.push({ name: dirName, status: 'added' });
    } catch {
      results.push({ name: dirName, status: 'exists' });
    }
  }

  return new Response(
    JSON.stringify({ ok: true, reposRoot, results }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

export const GET: APIRoute = async () => {
  const reposRoot = getReposRoot();
  const exists = fs.existsSync(reposRoot);
  let dirs: string[] = [];
  if (exists) {
    dirs = fs.readdirSync(reposRoot).filter(d => {
      try {
        return fs.statSync(`${reposRoot}/${d}`).isDirectory() &&
               fs.existsSync(`${reposRoot}/${d}/.git`);
      } catch { return false; }
    });
  }
  return new Response(
    JSON.stringify({ reposRoot, exists, repos: dirs }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
