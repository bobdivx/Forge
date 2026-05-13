import type { APIRoute } from 'astro';
import { setAutonomyMode, getAutonomyStatus, type AutonomyMode } from '../../../lib/forge-autonomy-loop';

export const prerender = false;

const ALLOWED: AutonomyMode[] = ['on', 'off', 'quiet_hours'];

export const POST: APIRoute = async ({ request }) => {
  let body: { mode?: string } = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'JSON invalide' }), { status: 400 });
  }
  const mode = String(body.mode || '');
  if (!ALLOWED.includes(mode as AutonomyMode)) {
    return new Response(JSON.stringify({ ok: false, error: 'mode invalide' }), { status: 400 });
  }
  await setAutonomyMode(mode as AutonomyMode);
  const status = await getAutonomyStatus();
  return new Response(JSON.stringify({ ok: true, ...status }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
