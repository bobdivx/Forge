import type { APIRoute } from 'astro';
import { getAgentActionDoctrine, saveAgentActionDoctrine } from '../../lib/agent-rules';
import { DEFAULT_AGENT_ACTION_DOCTRINE } from '../../lib/forge-tool-catalog';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }
  const doctrine = await getAgentActionDoctrine();
  return new Response(JSON.stringify({ doctrine, default: DEFAULT_AGENT_ACTION_DOCTRINE }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const PUT: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as { doctrine?: string; reset?: boolean };
  if (body.reset) {
    await saveAgentActionDoctrine(DEFAULT_AGENT_ACTION_DOCTRINE);
    return new Response(JSON.stringify({ ok: true, doctrine: DEFAULT_AGENT_ACTION_DOCTRINE }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const text = String(body.doctrine || '').trim();
  if (!text) {
    return new Response(JSON.stringify({ error: 'doctrine vide' }), { status: 400 });
  }
  await saveAgentActionDoctrine(text);
  return new Response(JSON.stringify({ ok: true, doctrine: text }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
