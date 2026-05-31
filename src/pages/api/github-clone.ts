import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import util from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { getReposRootResolved } from '../../lib/forge-repos';
import { getConfig } from '../../lib/config-db';

const execFileAsync = util.promisify(execFile);

export const POST: APIRoute = async ({ request }) => {
  try {
    const { repoUrl, repoName } = await request.json();

    if (!repoUrl || !repoName) {
      return new Response(JSON.stringify({ error: 'repoUrl et repoName requis' }), { status: 400 });
    }

    // 🛡️ Sentinel: Validate repoName to prevent directory traversal and command injection
    if (!/^[a-zA-Z0-9_.-]+$/.test(repoName) || repoName.includes('..')) {
      return new Response(JSON.stringify({ error: 'Nom de dépôt invalide' }), { status: 400 });
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
    // 🛡️ Sentinel: Make sure repoUrl is basically valid before injecting
    if (!repoUrl.startsWith('https://github.com/')) {
        return new Response(JSON.stringify({ error: 'URL Github invalide' }), { status: 400 });
    }
    const authUrl = repoUrl.replace('https://', `https://oauth2:${githubToken}@`);

    // Clone the repository
    // 🛡️ Sentinel: Prevent command injection using execFile instead of exec with string interpolation,
    // and use `--` to indicate end of options.
    const { stdout, stderr } = await execFileAsync('git', ['clone', '--', authUrl, repoName], { cwd: reposRoot });

    return new Response(JSON.stringify({ 
      status: 'ok', 
      message: 'Dépôt cloné avec succès ! Cliquez sur "Synchroniser" pour l\'ajouter au tableau de bord.' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    // 🛡️ Sentinel: Prevent token leak in error messages
    let msg = error.message || 'Erreur lors du clonage';
    msg = msg.replace(/https:\/\/[^@]+@/g, 'https://***@');

    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
