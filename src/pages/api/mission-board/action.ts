import type { APIRoute } from 'astro';
import {
  moveMissionItem,
  dismissMissionItem,
  pullMissionBoardOnce,
  type Column,
} from '../../../lib/forge-mission-board';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: { action?: string; uid?: string; target?: Column; maxPromote?: number } = {};
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'JSON invalide' }), { status: 400 });
  }
  const action = String(body.action || '');

  if (action === 'move') {
    if (!body.uid || !body.target) {
      return new Response(JSON.stringify({ ok: false, error: 'uid et target requis' }), { status: 400 });
    }
    const result = await moveMissionItem(body.uid, body.target);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (action === 'dismiss') {
    if (!body.uid) {
      return new Response(JSON.stringify({ ok: false, error: 'uid requis' }), { status: 400 });
    }
    const result = await dismissMissionItem(body.uid);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (action === 'pull_now') {
    const result = await pullMissionBoardOnce(Math.max(1, Math.min(20, body.maxPromote ?? 5)));
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: false, error: `action inconnue: ${action}` }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
};
