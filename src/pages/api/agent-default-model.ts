import type { APIRoute } from 'astro';
import { getAllConfig, setConfig } from '../../lib/config-db';

export const GET: APIRoute = async () => {
  const config = await getAllConfig();
  return new Response(JSON.stringify({ model: config.agentDefaultModel }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => ({}));
  const { model } = body;

  if (model === undefined) {
    return new Response(JSON.stringify({ error: 'Modèle requis' }), { status: 400 });
  }

  await setConfig({ agentDefaultModel: model });

  return new Response(JSON.stringify({ ok: true, model }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
