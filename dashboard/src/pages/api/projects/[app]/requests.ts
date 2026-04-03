import type { APIRoute } from 'astro';
import { db, Project, Request, eq, desc } from 'astro:db';

export const GET: APIRoute = async ({ params }) => {
  const appName = params.app;
  
  // 1. Trouver l'ID du projet par son nom
  const projects = await db.select().from(Project).where(eq(Project.name, String(appName)));
  if (projects.length === 0) {
    return new Response(JSON.stringify({ error: 'Projet introuvable en base' }), { status: 404 });
  }
  
  const projectId = projects[0].id;
  
  // 2. Récupérer les demandes associées
  const items = await db.select().from(Request)
    .where(eq(Request.projectId, projectId))
    .orderBy(desc(Request.createdAt));
    
  return new Response(JSON.stringify({ items }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ params, request }) => {
  const appName = params.app;
  
  const projects = await db.select().from(Project).where(eq(Project.name, String(appName)));
  if (projects.length === 0) {
    return new Response(JSON.stringify({ error: 'Projet introuvable en base' }), { status: 404 });
  }
  
  const projectId = projects[0].id;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400 });
  }

  const title = String(body?.title || '').trim();
  const content = String(body?.detail || body?.content || '').trim();
  
  if (title.length < 2) {
    return new Response(JSON.stringify({ error: 'Titre trop court' }), { status: 400 });
  }

  try {
    const inserted = await db.insert(Request).values({
      projectId,
      title,
      content,
      status: 'pending',
      priority: body?.priority || 'medium',
      author: 'Mathieu'
    }).returning();

    return new Response(JSON.stringify({ ok: true, item: inserted[0] }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
