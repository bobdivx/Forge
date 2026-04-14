import type { APIRoute } from 'astro';
import { resolveProjectPathVariants, isSafeRepoDirName } from '../../../../lib/forge-repos';
import { detectProjectServers } from '../../../../lib/project-app-config';

export const GET: APIRoute = async ({ params }) => {
  const app = params.app;
  if (!isSafeRepoDirName(String(app))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const projectPath = await resolveProjectPathVariants(String(app));
  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }

  const suggestions = detectProjectServers(projectPath);

  return new Response(JSON.stringify({ suggestions }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
