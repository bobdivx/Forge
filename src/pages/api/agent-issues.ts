import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import {
  normalizeAppIssueStatus,
  normalizeErrorType,
  APP_ISSUE_STATUSES,
} from '../../lib/forge-agent-work';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** GET — liste (filtres optionnels status, agentId = rapporteur ou assigné). */
export const GET: APIRoute = async ({ url }) => {
  try {
    const { db, AgentAppIssue, desc } = await loadAstroDb();
    const statusQ = url.searchParams.get('status');
    const agentId = url.searchParams.get('agentId');

    let rows = await db.select().from(AgentAppIssue).orderBy(desc(AgentAppIssue.createdAt)).limit(200);

    if (statusQ) {
      rows = rows.filter((r) => String(r.status).toLowerCase() === statusQ.toLowerCase());
    }
    if (agentId) {
      const id = String(agentId);
      rows = rows.filter(
        (r) => r.reportedByAgentId === id || (r.assigneeAgentId && r.assigneeAgentId === id),
      );
    }

    return json({
      issues: rows.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
      })),
      statuses: APP_ISSUE_STATUSES,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur';
    return json({ issues: [], error: msg, statuses: APP_ISSUE_STATUSES }, 200);
  }
};

/**
 * POST — crée une anomalie (navigateur ou agent local).
 * Corps : reportedByAgentId, url, errorType, title, detail?, projectId?, assigneeAgentId?
 */
export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'Corps JSON invalide' }, 400);
  }

  const reportedBy = String(body.reportedByAgentId ?? body.agentId ?? '').trim();
  const urlPath = String(body.url ?? '').trim();
  const title = String(body.title ?? '').trim();
  if (!reportedBy || !urlPath || !title) {
    return json(
      { error: 'Champs requis : reportedByAgentId (ou agentId), url, title' },
      400,
    );
  }

  const errorType = normalizeErrorType(String(body.errorType ?? 'other'));
  const detail = body.detail != null ? String(body.detail) : null;
  const assignee = body.assigneeAgentId != null ? String(body.assigneeAgentId).trim() : null;
  const projectId =
    body.projectId != null && body.projectId !== '' ? Number(body.projectId) : null;

  try {
    const { db, AgentAppIssue, AgentMessage } = await loadAstroDb();
    const now = new Date();
    const [row] = await db
      .insert(AgentAppIssue)
      .values({
        projectId: Number.isFinite(projectId as number) ? (projectId as number) : undefined,
        url: urlPath,
        errorType,
        title,
        detail: detail || undefined,
        status: 'open',
        reportedByAgentId: reportedBy,
        assigneeAgentId: assignee || undefined,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Notification au chef d'orchestre (ou à l'assignee si précisé) pour prise en charge
    await db.insert(AgentMessage).values({
      fromAgent: reportedBy,
      toAgent: assignee || 'CHEF_TECHNIQUE',
      content: `[AppIssue #${row?.id ?? '?'}] ${errorType} sur "${urlPath}" — "${title}"${detail ? ` | ${detail.slice(0, 200)}` : ''}`,
      timestamp: now,
    });

    return json({ ok: true, issue: row }, 201);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur insert';
    return json({ error: msg }, 500);
  }
};

/**
 * PUT — met à jour statut / assignation.
 * Corps : id, status?, assigneeAgentId?, detail? (remplace le détail si fourni)
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
  const nextStatus = statusRaw ? normalizeAppIssueStatus(statusRaw) : null;
  if (statusRaw && !nextStatus) {
    return json({ error: `status invalide : ${APP_ISSUE_STATUSES.join(', ')}` }, 400);
  }

  try {
    const { db, AgentAppIssue, eq } = await loadAstroDb();
    const now = new Date();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (nextStatus) patch.status = nextStatus;
    if (body.assigneeAgentId !== undefined) {
      const a = String(body.assigneeAgentId ?? '').trim();
      patch.assigneeAgentId = a || null;
    }
    if (body.detail !== undefined) patch.detail = String(body.detail);

    await db.update(AgentAppIssue).set(patch as any).where(eq(AgentAppIssue.id, id));
    return json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur update';
    return json({ error: msg }, 500);
  }
};

/**
 * DELETE — supprime une anomalie.
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
    const { db, AgentAppIssue, eq } = await loadAstroDb();
    await db.delete(AgentAppIssue).where(eq(AgentAppIssue.id, id));
    return json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur delete';
    return json({ error: msg }, 500);
  }
};
