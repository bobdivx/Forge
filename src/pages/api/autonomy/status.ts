import type { APIRoute } from 'astro';
import { getAutonomyStatus, startAutonomyLoop } from '../../../lib/forge-autonomy-loop';

export const prerender = false;

export const GET: APIRoute = async () => {
  void startAutonomyLoop().catch(() => undefined);
  const status = await getAutonomyStatus();
  return new Response(JSON.stringify({ ok: true, ...status }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
