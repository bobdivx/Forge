import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import {
  normalizeDependencyStatus,
  DEPENDENCY_STATUSES,
} from '../../lib/forge-agent-work';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** GET — liste (filtres status, agentId = demandeur ou assigné). */
export const GET: APIRoute = async ({ url }) => {
  try {
    const { db, AgentDependencyRequest, desc } = await loadAstroDb();
    const statusQ = url.searchParams.get('status');
    const agentId = url.searchParams.get('agentId');

    let rows = await db
      .select()
      .from(AgentDependencyRequest)
      .orderBy(desc(AgentDependencyRequest.createdAt))
      .limit(200);

    if (statusQ) {
      rows = rows.filter((r) => String(r.status).toLowerCase() === statusQ.toLowerCase());
    }
    if (agentId) {
      const id = String(agentId);
      rows = rows.filter(
        (r) =>
          r.requestedByAgentId === id || (r.assigneeAgentId && r.assigneeAgentId === id),
      );
    }

    return json({
      requests: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
      })),
      statuses: DEPENDENCY_STATUSES,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur';
    return json({ requests: [], error: msg, statuses: DEPENDENCY_STATUSES }, 200);
  }
};

/**
 * POST — nouvelle demande de dépendance.
 * Corps : requestedByAgentId (ou agentId), packageName, versionSpec?, isDev?, reason?, projectId?, assigneeAgentId?
 */
export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Corps JSON invalide' }, 400);
  }

  const requestedBy = String(body.requestedByAgentId ?? body.agentId ?? '').trim();
  const packageName = String(body.packageName ?? body.title ?? '').trim();
  if (!requestedBy || !packageName) {
    return json(
      { error: 'Champs requis : requestedByAgentId (ou agentId), packageName' },
      400,
    );
  }

  const versionSpec = body.versionSpec != null ? String(body.versionSpec) : undefined;
  const reason = body.reason != null ? String(body.reason) : undefined;
  const isDev = body.isDev === true || body.isDev === 1 || String(body.isDev) === '1' ? 1 : 0;
  const assignee = body.assigneeAgentId != null ? String(body.assigneeAgentId).trim() : null;
  const projectId =
    body.projectId != null && body.projectId !== '' ? Number(body.projectId) : null;

  try {
    const { db, AgentDependencyRequest, AgentMessage } = await loadAstroDb();
    const now = new Date();
    const [row] = await db
      .insert(AgentDependencyRequest)
      .values({
        projectId: Number.isFinite(projectId as number) ? (projectId as number) : undefined,
        packageName,
        versionSpec,
        isDev,
        reason,
        status: 'open',
        requestedByAgentId: requestedBy,
        assigneeAgentId: assignee || undefined,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Notification au chef d'orchestre pour assignation à DEV_BACKEND ou autre
    const target = assignee || 'CHEF_TECHNIQUE';
    await db.insert(AgentMessage).values({
      fromAgent: requestedBy,
      toAgent: target,
      content: `[DepRequest #${row?.id ?? '?'}] ${packageName}${versionSpec ? `@${versionSpec}` : ''} (${isDev ? 'devDep' : 'dep'})${reason ? ` — ${reason.slice(0, 200)}` : ''}`,
      timestamp: now,
    });

    return json({ ok: true, request: row }, 201);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur insert';
    return json({ error: msg }, 500);
  }
};

/**
 * PUT — met à jour statut / assignation.
 * Corps : id, status?, assigneeAgentId?, reason? (concat info résolution)
 */
export const PUT: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Corps JSON invalide' }, 400);
  }

  const id = Number(body.id);
  if (!Number.isFinite(id)) {
    return json({ error: 'id numérique requis' }, 400);
  }

  const statusRaw = body.status != null ? String(body.status) : null;
  const nextStatus = statusRaw ? normalizeDependencyStatus(statusRaw) : null;
  if (statusRaw && !nextStatus) {
    return json({ error: `status invalide : ${DEPENDENCY_STATUSES.join(', ')}` }, 400);
  }

  try {
    const { db, AgentDependencyRequest, eq } = await loadAstroDb();
    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (nextStatus) patch.status = nextStatus;
    if (body.assigneeAgentId !== undefined) {
      const a = String(body.assigneeAgentId ?? '').trim();
      patch.assigneeAgentId = a || null;
    }
    if (body.reason !== undefined) patch.reason = String(body.reason);

    await db.update(AgentDependencyRequest).set(patch as any).where(eq(AgentDependencyRequest.id, id));
    return json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur update';
    return json({ error: msg }, 500);
  }
};

/**
 * DELETE — supprime une demande de dépendance.
 * Corps : id*
 */
export const DELETE: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Corps JSON invalide' }, 400);
  }

  const id = Number(body.id);
  if (!Number.isFinite(id) || id < 1) {
    return json({ error: 'id numérique requis' }, 400);
  }

  try {
    const { db, AgentDependencyRequest, eq } = await loadAstroDb();
    await db.delete(AgentDependencyRequest).where(eq(AgentDependencyRequest.id, id));
    return json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur delete';
    return json({ error: msg }, 500);
  }
};
