import type { APIRoute } from 'astro';
import {
  getWorkSystemStatus,
  manualStart,
  manualStop,
  enableScheduledMode,
  startScheduler,
} from '../../lib/forge-work-scheduler';

/** GET — état courant du système de travail. */
export const GET: APIRoute = async () => {
  try {
    startScheduler();
    const status = await getWorkSystemStatus();
    return new Response(JSON.stringify(status), {
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

/**
 * POST — contrôle manuel.
 * Body : { action: 'start' | 'stop' | 'schedule', agentIds?: string[] }
 *   start    — démarre immédiatement le travail (override planifié)
 *   stop     — arrête le travail (reste stopped jusqu'à réactivation)
 *   schedule — remet le système en mode planifié automatique
 */
export const POST: APIRoute = async ({ request }) => {
  let body: { action?: string; agentIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const action = String(body.action || '').trim();
  const agentIds = Array.isArray(body.agentIds) ? body.agentIds : [];

  try {
    startScheduler();
    if (action === 'start') {
      const workCycle = await manualStart(agentIds);
      const status = await getWorkSystemStatus();
      return new Response(JSON.stringify({ ok: true, workCycle, ...status }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } else if (action === 'stop') {
      await manualStop();
    } else if (action === 'schedule') {
      enableScheduledMode();
    } else {
      return new Response(JSON.stringify({ error: 'action invalide (start | stop | schedule)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const status = await getWorkSystemStatus();
    return new Response(JSON.stringify({ ok: true, ...status }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
