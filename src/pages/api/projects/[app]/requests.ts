import type { APIRoute } from 'astro';
import path from 'node:path';
import { db, Project, Request, desc, eq } from 'astro:db';
import {
  resolveProjectPathVariants,
  isSafeRepoDirName,
  resolveProjectPathFromDbProject,
  repoSlugFromProject,
} from '../../../../lib/forge-repos';
import { mapDbRequestToUi } from '../../../../lib/forge-request-mapper';

async function findProjectRowForApp(folderKey: string) {
  const projects = await db.select().from(Project);
  let row = projects.find((p) => repoSlugFromProject(p) === folderKey);
  if (row) return row;
  row = projects.find((p) => {
    const rpath = resolveProjectPathFromDbProject(p);
    return rpath && path.basename(rpath) === folderKey;
  });
  return row ?? null;
}

export const GET: APIRoute = async ({ params }) => {
  const app = params.app;
  if (!isSafeRepoDirName(String(app))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const folderKey = String(app);
  const projectPath = resolveProjectPathVariants(folderKey);
  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }

  const projectRow = await findProjectRowForApp(folderKey);
  if (!projectRow) {
    return new Response(
      JSON.stringify({
        items: [],
        noProjectInDb: true,
        message:
          'Ce dépôt n’est pas lié à un projet en base. Ajoutez-le depuis Applications pour enregistrer des demandes.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const rows = await db
    .select()
    .from(Request)
    .where(eq(Request.projectId, projectRow.id))
    .orderBy(desc(Request.updatedAt))
    .limit(100);

  const items = rows.map(mapDbRequestToUi);

  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  const app = params.app;
  if (!isSafeRepoDirName(String(app))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const folderKey = String(app);
  const projectPath = resolveProjectPathVariants(folderKey);
  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }

  const projectRow = await findProjectRowForApp(folderKey);
  if (!projectRow) {
    return new Response(
      JSON.stringify({
        error:
          'Projet absent de la base : ajoutez ce dépôt depuis Applications avant d’enregistrer une demande.',
      }),
      { status: 409 },
    );
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

  const detail = body?.detail != null ? String(body.detail).slice(0, 8000) : '';
  const author =
    (locals as { user?: { email?: string } })?.user?.email?.trim() || 'utilisateur';

  const now = new Date();
  await db.insert(Request).values({
    projectId: projectRow.id,
    title: title.slice(0, 500),
    content: detail,
    status: 'pending',
    priority: 'medium',
    author,
    requestType: type,
    createdAt: now,
    updatedAt: now,
  });

  const inserted = await db
    .select()
    .from(Request)
    .where(eq(Request.projectId, projectRow.id))
    .orderBy(desc(Request.id))
    .limit(1);

  const row = inserted[0];
  if (!row) {
    return new Response(JSON.stringify({ error: 'Insertion échouée' }), { status: 500 });
  }

  const item = mapDbRequestToUi(row);

  return new Response(JSON.stringify({ ok: true, item }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};
