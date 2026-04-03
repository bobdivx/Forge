import { db, Project } from 'astro:db';
import { readAppSettings } from '../../../lib/auth';
import fs from 'fs';

export async function POST({ locals }) {
  const email = locals.user?.email;
  const settings = readAppSettings(email);
  const reposRoot = settings?.forgeReposRoot || '/mnt/GitHub';

  console.log(`Syncing projects from ${reposRoot} to Astro DB...`);
  
  if (!fs.existsSync(reposRoot)) {
    return new Response(JSON.stringify({ ok: false, error: 'Dossier racine introuvable' }), { status: 404 });
  }

  const dirs = fs.readdirSync(reposRoot).filter(d => fs.statSync(`${reposRoot}/${d}`).isDirectory());
  const results = [];

  for (const dirName of dirs) {
    const fullPath = `${reposRoot}/${dirName}`;
    if (fs.existsSync(`${fullPath}/.git`)) {
      try {
        await db.insert(Project).values({
          name: dirName,
          path: fullPath,
          status: 'active',
          description: 'Dépôt détecté sur le NAS'
        });
        results.push({ name: dirName, status: 'added' });
      } catch (e) {
        results.push({ name: dirName, status: 'exists' });
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}
