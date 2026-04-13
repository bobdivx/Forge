import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';

/** GET — liste toutes les plages de travail. */
export const GET: APIRoute = async () => {
  try {
    const { db, WorkSchedule } = await loadAstroDb();
    const rows = await db.select().from(WorkSchedule);
    return new Response(JSON.stringify({ schedules: rows }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/** POST — créer ou mettre à jour une plage (id présent = update, absent = create). */
export const POST: APIRoute = async ({ request }) => {
  let body: {
    id?: number;
    label?: string;
    days?: number[];
    startTime?: string;
    endTime?: string;
    agentIds?: string[];
    enabled?: boolean | number;
  };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const days = Array.isArray(body.days) ? body.days : [1, 2, 3, 4, 5];
  const agentIds = Array.isArray(body.agentIds) ? body.agentIds : [];
  const startTime = String(body.startTime || '09:00');
  const endTime = String(body.endTime || '18:00');
  const label = String(body.label || 'Horaires de travail');
  const enabled = body.enabled === false || body.enabled === 0 ? 0 : 1;
  const now = new Date();

  try {
    const { db, WorkSchedule, eq } = await loadAstroDb();

    if (typeof body.id === 'number') {
      await db
        .update(WorkSchedule)
        .set({
          label,
          days: JSON.stringify(days),
          startTime,
          endTime,
          agentIds: JSON.stringify(agentIds),
          enabled,
          updatedAt: now,
        })
        .where(eq(WorkSchedule.id, body.id));
      const [updated] = await db.select().from(WorkSchedule).where(eq(WorkSchedule.id, body.id));
      return new Response(JSON.stringify({ schedule: updated }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      await db.insert(WorkSchedule).values({
        label,
        days: JSON.stringify(days),
        startTime,
        endTime,
        agentIds: JSON.stringify(agentIds),
        enabled,
        updatedAt: now,
      });
      const rows = await db.select().from(WorkSchedule);
      const created = rows[rows.length - 1];
      return new Response(JSON.stringify({ schedule: created }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/** DELETE — supprimer une plage par id. */
export const DELETE: APIRoute = async ({ request }) => {
  let body: { id?: number };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (typeof body.id !== 'number') {
    return new Response(JSON.stringify({ error: 'id requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { db, WorkSchedule, eq } = await loadAstroDb();
    await db.delete(WorkSchedule).where(eq(WorkSchedule.id, body.id));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
