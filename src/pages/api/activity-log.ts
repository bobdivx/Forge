// @ts-nocheck
export const prerender = false;

/**
 * GET  /api/activity-log?limit=50&entityType=agent&agentId=XXX
 * POST /api/activity-log  → enregistre manuellement une entrée
 *
 * Inspiré de Paperclip GET /companies/:id/activity
 */

export async function GET({ url }: { url: URL }) {
  try {
    const { loadAstroDb } = await import('../../lib/load-astro-db');
    const { db, ActivityLog, desc, eq, and } = await loadAstroDb();

    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50', 10), 200);
    const entityType = url.searchParams.get('entityType');
    const actorId = url.searchParams.get('actorId');

    let query = db.select().from(ActivityLog).orderBy(desc(ActivityLog.createdAt)).limit(limit);

    // Les filtres sont appliqués après (Astro DB n'a pas de where conditionnel)
    const rows = await query;
    let filtered = rows;
    if (entityType) filtered = filtered.filter((r: { entityType: string }) => r.entityType === entityType);
    if (actorId) filtered = filtered.filter((r: { actorId: string }) => r.actorId === actorId);

    return new Response(JSON.stringify({ logs: filtered, total: filtered.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function POST({ request }: { request: Request }) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { actorType = 'user', actorId = 'board', action, entityType, entityId, details } = body as {
    actorType?: string;
    actorId?: string;
    action?: string;
    entityType?: string;
    entityId?: string;
    details?: unknown;
  };

  if (!action || !entityType || !entityId) {
    return new Response(
      JSON.stringify({ error: 'action, entityType, entityId are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { loadAstroDb } = await import('../../lib/load-astro-db');
    const { db, ActivityLog } = await loadAstroDb();

    await db.insert(ActivityLog).values({
      actorType,
      actorId,
      action,
      entityType,
      entityId,
      details: details ? JSON.stringify(details) : null,
      createdAt: new Date(),
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', detail: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
