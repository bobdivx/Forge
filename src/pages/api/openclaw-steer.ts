import type { APIRoute } from 'astro';
import { fetchOpenClawJson } from '../../lib/openclaw-gateway';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { sessionKey, model } = await request.json();
    if (!sessionKey || !model) {
      return new Response(JSON.stringify({ error: 'Paramètres manquants : sessionKey et model requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const email = (locals as { user?: { email?: string } }).user?.email;

    const result = await fetchOpenClawJson(email, '/tools/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tool: 'sessions_steer',
        action: 'json',
        args: { sessionKey, model },
      }),
    });

    if (!result.ok) {
      return new Response(
        JSON.stringify({ error: result.error || `Gateway HTTP ${result.status}`, detail: result.data }),
        { status: result.status || 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ ok: true, detail: result.data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur interne';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
