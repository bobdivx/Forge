import type { APIRoute } from 'astro';
import { db, Request, Project, AgentMessage, ActivityLog, desc, eq } from 'astro:db';

export const GET: APIRoute = async () => {
  try {
    const rows = await db
      .select({
        id: Request.id,
        title: Request.title,
        content: Request.content,
        status: Request.status,
        priority: Request.priority,
        author: Request.author,
        requestType: Request.requestType,
        assigneeAgentId: Request.assigneeAgentId,
        createdAt: Request.createdAt,
        updatedAt: Request.updatedAt,
        projectName: Project.name,
      })
      .from(Request)
      .leftJoin(Project, eq(Request.projectId, Project.id))
      .orderBy(desc(Request.updatedAt))
      .limit(100);

    return new Response(JSON.stringify({ proposals: rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

/**
 * POST — crée une demande depuis le carnet de bord.
 * Corps : projectId*, title*, content?, priority?, requestType?, author?, assigneeAgentId?
 */
export const POST: APIRoute = async ({ request, locals }) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Corps JSON invalide' }), { status: 400 });
  }

  const projectId = Number(body.projectId);
  if (!Number.isFinite(projectId) || projectId < 1) {
    return new Response(JSON.stringify({ error: 'projectId requis' }), { status: 400 });
  }

  const title = String(body.title ?? '').trim();
  if (title.length < 2) {
    return new Response(JSON.stringify({ error: 'Titre trop court (min 2 caractères)' }), { status: 400 });
  }

  const content = String(body.content ?? '').trim();
  const priority = ['high', 'medium', 'low'].includes(String(body.priority)) ? String(body.priority) : 'medium';
  const requestType = String(body.requestType ?? '') === 'Correction' ? 'Correction' : 'Fonctionnalite';
  const author = String(body.author ?? (locals as any)?.user?.email ?? 'utilisateur').trim() || 'utilisateur';
  const assigneeAgentId = String(body.assigneeAgentId ?? 'CHEF_TECHNIQUE').trim() || 'CHEF_TECHNIQUE';

  try {
    const now = new Date();
    const [row] = await db.insert(Request).values({
      projectId,
      title: title.slice(0, 500),
      content: content.slice(0, 8000),
      status: 'pending',
      priority,
      author,
      requestType,
      assigneeAgentId: assigneeAgentId.slice(0, 120) || undefined,
      createdAt: now,
      updatedAt: now,
    }).returning();

    await db.insert(AgentMessage).values({
      fromAgent: 'HUMAIN',
      toAgent: assigneeAgentId,
      content: `[Nouvelle demande #${row?.id ?? '?'}] ${requestType} — "${title.slice(0, 200)}" (priorité: ${priority}, projet: ${projectId}, auteur: ${author})`,
      timestamp: now,
    });

    if (row?.id != null) {
      await db.insert(ActivityLog).values({
        actorType: 'user',
        actorId: author.slice(0, 200),
        action: 'carnet.request.created',
        entityType: 'request',
        entityId: String(row.id),
        details: JSON.stringify({
          title: title.slice(0, 240),
          requestType,
          priority,
          projectId,
          assigneeAgentId,
        }),
        createdAt: now,
      });
    }

    return new Response(JSON.stringify({ ok: true, request: row }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

/**
 * PUT — met à jour statut / priorité / contenu d'une demande.
 * Corps : id*, status?, priority?, content?
 */
export const PUT: APIRoute = async ({ request, locals }) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Corps JSON invalide' }), { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isFinite(id) || id < 1) {
    return new Response(JSON.stringify({ error: 'id requis' }), { status: 400 });
  }

  const VALID_STATUSES = ['pending', 'in_progress', 'completed', 'rejected'];
  const VALID_PRIORITIES = ['low', 'medium', 'high'];

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status != null) {
    const s = String(body.status);
    if (!VALID_STATUSES.includes(s)) {
      return new Response(JSON.stringify({ error: `status invalide : ${VALID_STATUSES.join(', ')}` }), { status: 400 });
    }
    patch.status = s;
  }
  if (body.priority != null) {
    const p = String(body.priority);
    if (!VALID_PRIORITIES.includes(p)) {
      return new Response(JSON.stringify({ error: `priority invalide : ${VALID_PRIORITIES.join(', ')}` }), { status: 400 });
    }
    patch.priority = p;
  }
  if (body.content != null) patch.content = String(body.content).slice(0, 8000);
  if (body.assigneeAgentId != null) {
    patch.assigneeAgentId = String(body.assigneeAgentId).trim().slice(0, 120) || undefined;
  }

  try {
    const existingRows = await db.select().from(Request).where(eq(Request.id, id)).limit(1);
    const existing = existingRows[0];
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Demande introuvable' }), { status: 404 });
    }

    await db.update(Request).set(patch as any).where(eq(Request.id, id));

    const actorEmail =
      String((locals as { user?: { email?: string } })?.user?.email ?? '').trim() || 'dashboard';
    const now = new Date();

    if (patch.status != null && String(existing.status) !== String(patch.status)) {
      await db.insert(ActivityLog).values({
        actorType: 'user',
        actorId: actorEmail.slice(0, 200),
        action: 'carnet.request.status_changed',
        entityType: 'request',
        entityId: String(id),
        details: JSON.stringify({
          from: existing.status,
          to: patch.status,
          title: String(existing.title || '').slice(0, 240),
        }),
        createdAt: now,
      });
    }

    if (
      patch.assigneeAgentId !== undefined &&
      String(existing.assigneeAgentId ?? '').trim() !== String(patch.assigneeAgentId ?? '').trim()
    ) {
      await db.insert(ActivityLog).values({
        actorType: 'user',
        actorId: actorEmail.slice(0, 200),
        action: 'carnet.request.assignee_changed',
        entityType: 'request',
        entityId: String(id),
        details: JSON.stringify({
          from: existing.assigneeAgentId ?? null,
          to: patch.assigneeAgentId ?? null,
          title: String(existing.title || '').slice(0, 240),
        }),
        createdAt: now,
      });
    }

    return new Response(JSON.stringify({ ok: true, id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

/**
 * DELETE — supprime une demande.
 * Corps : id*
 */
export const DELETE: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return new Response(JSON.stringify({ error: 'Corps JSON invalide' }), { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isFinite(id) || id < 1) {
    return new Response(JSON.stringify({ error: 'id requis' }), { status: 400 });
  }

  try {
    await db.delete(Request).where(eq(Request.id, id));
    return new Response(JSON.stringify({ ok: true, id }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};
