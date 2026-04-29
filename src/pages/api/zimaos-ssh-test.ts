import type { APIRoute } from 'astro';
import { getZimaOSInfraClient } from '../../lib/zimaos-infra-client';

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ ok: false, message: 'Non authentifié' }), { status: 401 });
  }

  try {
    const infra = await getZimaOSInfraClient();
    const result = await infra.testConnection();
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, message: e.message }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
