import type { APIRoute } from 'astro';
import { inArray, sql } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import { insertForgeActivityLog } from '../../lib/forge-activity-log';

type ItemType = 'request' | 'issue' | 'dep';
type DeleteScope = 'active' | 'finished' | 'all';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const STATUS_GROUPS: Record<ItemType, Record<Exclude<DeleteScope, 'all'>, string[]>> = {
  request: {
    active: ['pending', 'in_progress'],
    finished: ['completed', 'rejected'],
  },
  issue: {
    active: ['open', 'in_progress'],
    finished: ['resolved', 'wont_fix'],
  },
  dep: {
    active: ['open', 'in_progress'],
    finished: ['installed', 'rejected'],
  },
};

const ITEM_LABELS: Record<ItemType, { singular: string; plural: string; entityType: string }> = {
  request: { singular: 'demande', plural: 'demandes', entityType: 'request' },
  issue: { singular: 'bug', plural: 'bugs', entityType: 'agent_app_issue' },
  dep: { singular: 'demande de dépendance', plural: 'demandes de dépendances', entityType: 'agent_dependency_request' },
};

function messageFor(type: ItemType, scope: DeleteScope, count: number): string {
  const label = ITEM_LABELS[type];
  if (count === 0) return `Aucune ${label.singular} à supprimer pour ce filtre.`;
  if (scope === 'all') return `${count} ${label.plural} supprimé(s).`;
  const group = scope === 'active' ? 'en attente / en cours' : 'terminé(s) / rejeté(s)';
  return `${count} ${label.plural} ${group} supprimé(s).`;
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return json({ error: 'Non authentifié' }, 401);
  }

  const email = String(locals.user.email).trim().slice(0, 200);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action || '').trim();
  const itemType = String(body.itemType || '').trim() as ItemType;
  const scope = String(body.scope || '').trim() as DeleteScope;

  if (action !== 'deleteWorkItems') {
    return json({ error: 'action attendue : deleteWorkItems' }, 400);
  }
  if (!['request', 'issue', 'dep'].includes(itemType)) {
    return json({ error: 'itemType attendu : request | issue | dep' }, 400);
  }
  if (!['active', 'finished', 'all'].includes(scope)) {
    return json({ error: 'scope attendu : active | finished | all' }, 400);
  }

  try {
    const { db, Request, AgentAppIssue, AgentDependencyRequest } = await loadAstroDb();
    const table =
      itemType === 'request' ? Request : itemType === 'issue' ? AgentAppIssue : AgentDependencyRequest;
    const label = ITEM_LABELS[itemType];

    if (scope === 'all') {
      const before = await db.select().from(table);
      await db.delete(table).where(sql`1 = 1`);
      await insertForgeActivityLog({
        actorType: 'user',
        actorId: email,
        action: 'work.item.bulk_deleted',
        entityType: label.entityType,
        entityId: 'all',
        details: { itemType, scope, count: before.length },
      });
      return json({ ok: true, deleted: before.length, message: messageFor(itemType, scope, before.length) });
    }

    const statuses = STATUS_GROUPS[itemType][scope];
    const before = await db.select().from(table).where(inArray(table.status, statuses));
    await db.delete(table).where(inArray(table.status, statuses));
    await insertForgeActivityLog({
      actorType: 'user',
      actorId: email,
      action: 'work.item.bulk_deleted',
      entityType: label.entityType,
      entityId: `scope:${scope}`,
      details: { itemType, scope, statuses, count: before.length },
    });
    return json({ ok: true, deleted: before.length, message: messageFor(itemType, scope, before.length) });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Suppression impossible' }, 500);
  }
};

