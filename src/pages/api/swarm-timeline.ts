import type { APIRoute } from 'astro';
import { buildSwarmTimelineEvents } from '../../lib/forge-swarm-timeline';

/** GET — événements agrégés pour la page Flux Swarm (auth session). */
export const GET: APIRoute = async () => {
  try {
    const events = await buildSwarmTimelineEvents();
    return new Response(JSON.stringify({ ok: true, events }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ ok: false, error: msg, events: [] }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
