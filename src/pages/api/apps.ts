import type { APIRoute } from 'astro';
import fs from 'fs';
import path from 'path';
import { getReposRootResolved } from '../../lib/forge-repos';
import { summarizeGithubFolder } from '../../lib/project-github-meta';

// Middleware-like security check
const validateAuth = (request: Request) => {
  const authHeader = request.headers.get('Authorization');
  const forgeToken = process.env.FORGE_API_TOKEN;

  if (!forgeToken) return true; // Bypass if not configured yet
  return authHeader === `Bearer ${forgeToken}`;
};

export const GET: APIRoute = async ({ request }) => {
  if (!validateAuth(request)) {
    return new Response(JSON.stringify({ error: 'Non autorisé' }), { status: 401 });
  }

  try {
    const githubPath = await getReposRootResolved();

    if (!fs.existsSync(githubPath)) {
      return new Response(
        JSON.stringify({ error: 'Chemin GitHub non trouvé' }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    const entries = fs.readdirSync(githubPath, { withFileTypes: true });
    const projects = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => {
        const projectPath = path.join(githubPath, entry.name);
        let lastModified = 0;
        try {
          lastModified = fs.statSync(projectPath).mtimeMs;
        } catch {
          /* ignore */
        }

        let github;
        try {
          github = summarizeGithubFolder(projectPath);
        } catch {
          github = {
            present: false,
            workflows: [],
            dependabot: false,
            codeowners: false,
            funding: false,
            issueTemplatesCount: 0,
            pullRequestTemplatePaths: [],
            notablePaths: [],
            remoteOriginUrl: null,
          };
        }

        return {
          name: entry.name,
          path: projectPath,
          lastModified,
          github,
        };
      })
      .sort((a, b) => b.lastModified - a.lastModified);

    return new Response(JSON.stringify(projects), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Erreur lors du listage des applications' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
