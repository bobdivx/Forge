import type { APIRoute } from 'astro';
import { exec } from 'node:child_process';
import util from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { getReposRootResolved } from '../../lib/forge-repos';
import { getConfig } from '../../lib/config-db';

const execPromise = util.promisify(exec);

export const POST: APIRoute = async ({ request }) => {
  try {
    const { repoUrl, repoName } = await request.json();

    if (!repoUrl || !repoName) {
      return new Response(JSON.stringify({ error: 'repoUrl et repoName requis' }), { status: 400 });
    }

    const githubToken = await getConfig('githubToken', true);
    if (!githubToken || githubToken.trim() === '') {
      return new Response(JSON.stringify({ error: 'Jeton GitHub manquant' }), { status: 400 });
    }

    const reposRoot = await getReposRootResolved();
    const targetPath = path.join(reposRoot, repoName);

    if (fs.existsSync(targetPath)) {
      return new Response(JSON.stringify({ error: 'Un dossier avec ce nom existe déjà dans Forge.' }), { status: 400 });
    }

    // Inject token into URL for private repo cloning
    // Assuming format https://github.com/user/repo.git
    const authUrl = repoUrl.replace('https://', `https://oauth2:${githubToken}@`);

    // Clone the repository
    const { stdout, stderr } = await execPromise(`git clone ${authUrl} ${repoName}`, { cwd: reposRoot });

    // Try to auto-sync it into the database
    try {
      const syncScript = path.join(process.cwd(), 'src/pages/api/sync-projects.ts');
      // Just ping the sync endpoint internally or rely on the user clicking "Sync"
      // For simplicity, we just clone here. The user can click "Synchroniser" on the dashboard.
    } catch(e) {
      // Ignore sync error
    }

    return new Response(JSON.stringify({ 
      status: 'ok', 
      message: 'Dépôt cloné avec succès ! Cliquez sur "Synchroniser" pour l\'ajouter au tableau de bord.' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Erreur lors du clonage' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
