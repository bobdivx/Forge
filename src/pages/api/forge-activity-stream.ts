import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import { gt, desc } from 'drizzle-orm';

export const prerender = false;

/**
 * SSE — diffuse les nouvelles entrées d'`ActivityLog` toutes les 2 s.
 *
 * Initial : envoie les 50 dernières entrées (du plus ancien au plus récent).
 * Puis : poll incrémental sur `id > lastSeen`.
 */
export const GET: APIRoute = async () => {
  const encoder = new TextEncoder();
  let lastId = 0;
  let closed = false;
  let pollHandle: NodeJS.Timeout | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventName: string, data: unknown) => {
        if (closed) return;
        try {
          const payload = `event: ${eventName}\n` + `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(payload));
        } catch {
          /* fermé */
        }
      };

      try {
        const { db, ActivityLog } = await loadAstroDb();
        // Snapshot initial (les 50 plus récentes, renvoyées du plus ancien au plus récent)
        const initial = await db
          .select()
          .from(ActivityLog)
          .orderBy(desc(ActivityLog.id))
          .limit(50);
        const ordered = initial.slice().reverse();
        for (const row of ordered) {
          lastId = Math.max(lastId, Number(row.id));
          send('activity', {
            id: row.id,
            actorType: row.actorType,
            actorId: row.actorId,
            action: row.action,
            entityType: row.entityType,
            entityId: row.entityId,
            details: row.details,
            createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
          });
        }
        send('ping', { at: new Date().toISOString() });

        pollHandle = setInterval(async () => {
          if (closed) return;
          try {
            const newer = await db
              .select()
              .from(ActivityLog)
              .where(gt(ActivityLog.id, lastId))
              .orderBy(ActivityLog.id)
              .limit(50);
            for (const row of newer) {
              lastId = Math.max(lastId, Number(row.id));
              send('activity', {
                id: row.id,
                actorType: row.actorType,
                actorId: row.actorId,
                action: row.action,
                entityType: row.entityType,
                entityId: row.entityId,
                details: row.details,
                createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
              });
            }
            send('ping', { at: new Date().toISOString() });
          } catch (e) {
            send('error', { message: e instanceof Error ? e.message : String(e) });
          }
        }, 2000);
      } catch (e) {
        send('error', { message: e instanceof Error ? e.message : String(e) });
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      }
    },
    cancel() {
      closed = true;
      if (pollHandle) clearInterval(pollHandle);
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
