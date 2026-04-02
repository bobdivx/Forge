import type { APIRoute } from 'astro';
import { resolveProjectPath, isSafeRepoDirName } from '../../../../lib/forge-repos';
import { readForgeRequests, appendForgeRequest } from '../../../../lib/project-requests';

export const GET: APIRoute = async ({ params }) => {
  const app = params.app;
  if (!isSafeRepoDirName(String(app))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const projectPath = resolveProjectPath(String(app));
  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }
  const items = readForgeRequests(projectPath);
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ params, request }) => {
  const app = params.app;
  if (!isSafeRepoDirName(String(app))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const projectPath = resolveProjectPath(String(app));
  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400 });
  }

  const type = body?.type === 'Correction' ? 'Correction' : 'Fonctionnalite';
  const title = String(body?.title || '').trim();
  if (title.length < 2) {
    return new Response(JSON.stringify({ error: 'Titre trop court' }), { status: 400 });
  }

  const item = appendForgeRequest(projectPath, {
    type,
    title,
    detail: body?.detail,
  });

  if (!item) {
    return new Response(JSON.stringify({ error: 'Sauvegarde impossible' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, item }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
