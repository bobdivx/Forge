import type { APIRoute } from 'astro';
import { resolveProjectPathVariants } from '../../../../lib/forge-repos';
import { summarizeGithubFolder } from '../../../../lib/project-github-meta';

/** GET — synthèse `.github` + remote `origin` pour une app Forge (disque local). */
export const GET: APIRoute = async ({ params }) => {
  const appKey = params.app != null ? String(params.app).trim() : '';
  if (!appKey) {
    return new Response(JSON.stringify({ error: 'Paramètre app manquant' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resolved = await resolveProjectPathVariants(appKey);
  if (!resolved) {
    return new Response(JSON.stringify({ error: 'Projet introuvable', app: appKey }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const summary = summarizeGithubFolder(resolved);
  return new Response(JSON.stringify({ app: appKey, projectPath: resolved, ...summary }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
