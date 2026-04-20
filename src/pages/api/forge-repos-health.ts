import type { APIRoute } from 'astro';
import { getForgeReposRootHealth } from '../../lib/forge-repos-health';

/**
 * État du répertoire applications (forgeReposRoot) tel que vu par le processus Forge.
 */
export const GET: APIRoute = async () => {
  try {
    const health = await getForgeReposRootHealth();
    return new Response(
      JSON.stringify({
        ...health,
        openclawNote:
          'OpenClaw doit monter le même stockage au même chemin absolu dans son conteneur (ex. /media/GitHub:/media/GitHub). Ce contrôle ne voit pas le conteneur OpenClaw.',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
