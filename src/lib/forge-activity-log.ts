/**
 * Journal ActivityLog — événements explicites pour le Flux Swarm et l’audit.
 */

import { loadAstroDb } from './load-astro-db';

function stringifyDetails(details: Record<string, unknown> | string | undefined): string | undefined {
  if (details == null) return undefined;
  if (typeof details === 'string') return details.slice(0, 4000);
  try {
    return JSON.stringify(details).slice(0, 4000);
  } catch {
    return undefined;
  }
}

export async function insertForgeActivityLog(opts: {
  actorType: 'agent' | 'user' | 'system';
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown> | string;
}): Promise<void> {
  try {
    const { db, ActivityLog } = await loadAstroDb();
    await db.insert(ActivityLog).values({
      actorType: opts.actorType,
      actorId: String(opts.actorId || '').slice(0, 200),
      action: String(opts.action || '').slice(0, 200),
      entityType: String(opts.entityType || '').slice(0, 120),
      entityId: String(opts.entityId || '').slice(0, 120),
      details: stringifyDetails(opts.details),
      createdAt: new Date(),
    });
  } catch (e) {
    console.warn('[forge-activity-log]', opts.action, e);
  }
}
