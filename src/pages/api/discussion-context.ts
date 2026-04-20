import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';

/**
 * Données pour la page Discussion : projets + demandes (Request) récentes.
 */
export const GET: APIRoute = async () => {
  try {
    const { db, Project, Request } = await loadAstroDb();
    const projects = await db
      .select({ id: Project.id, name: Project.name, path: Project.path, status: Project.status })
      .from(Project)
      .orderBy(Project.name);
    const projectById = new Map(projects.map((p) => [p.id, p]));
    const requestRows = await db
      .select()
      .from(Request)
      .orderBy(desc(Request.createdAt))
      .limit(200);
    const requests = requestRows.map((r) => {
      const p = r.projectId != null ? projectById.get(r.projectId) : undefined;
      return {
        id: r.id,
        projectId: r.projectId,
        projectName: p?.name ?? null,
        title: r.title,
        content: r.content,
        status: r.status,
        requestType: r.requestType,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      };
    });
    return new Response(JSON.stringify({ projects, requests }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur base';
    return new Response(JSON.stringify({ projects: [], requests: [], error: msg }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
