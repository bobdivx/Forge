import type { APIRoute } from 'astro';
import { getConfig } from '../../lib/config-db';

export const GET: APIRoute = async ({ request }) => {
  try {
    const githubToken = await getConfig('githubToken', true);
    
    if (!githubToken || githubToken.trim() === '') {
      return new Response(JSON.stringify({ 
        error: 'Aucun jeton GitHub (PAT) configuré. Veuillez l\'ajouter dans les Paramètres > Jetons API.' 
      }), { status: 400 });
    }

    // Fetch repositories from GitHub API
    const response = await fetch('https://api.github.com/user/repos?sort=updated&per_page=100', {
      headers: {
        'Authorization': `token ${githubToken}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'DevForge-App'
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        return new Response(JSON.stringify({ error: 'Jeton GitHub invalide ou expiré.' }), { status: 401 });
      }
      throw new Error(`Erreur GitHub API: ${response.statusText}`);
    }

    const repos = await response.json();
    
    // Format the response
    const formattedRepos = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      url: repo.html_url,
      cloneUrl: repo.clone_url,
      private: repo.private,
      updatedAt: repo.updated_at,
      language: repo.language
    }));

    return new Response(JSON.stringify({ repos: formattedRepos }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Erreur serveur GitHub' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
