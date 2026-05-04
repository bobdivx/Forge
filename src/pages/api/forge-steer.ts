import type { APIRoute } from 'astro';
import { fetchZimaOSJson } from '../../lib/forge-gateway';
import { attemptZimaOSPreRepair } from './_forge-pre-repair';

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
    const preRepair = await attemptZimaOSPreRepair('sessions-steer');

    const result = await fetchZimaOSJson(email, '/tools/invoke', {
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
        JSON.stringify({ error: result.error || `Gateway HTTP ${result.status}`, detail: result.data, preRepair }),
        { status: result.status || 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ ok: true, detail: result.data, preRepair }), {
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
