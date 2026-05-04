import type { APIRoute } from 'astro';
import { runZimaOSAutoRepair } from '../../lib/forge-auto-repair';

/**
 * POST : diagnostic + écriture Config (URL gateway, jeton, dockerAppDataDir si déductible).
 * Session requise. Corps JSON optionnel : `{ "restartDocker": true }` pour un `docker restart` si aucune combinaison ne répond.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { restartDocker?: boolean };
  const restartDocker = Boolean(body.restartDocker);

  try {
    const result = await runZimaOSAutoRepair({ restartDocker });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur serveur';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
