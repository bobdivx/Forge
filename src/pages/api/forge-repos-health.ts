import type { APIRoute } from 'astro';
import { getForgeReposRootHealth } from '../../lib/forge-repos-health';
import { getConfig } from '../../lib/config-db';
import { probeOpenClawContainerPath } from '../../lib/openclaw-docker-mounts';

/**
 * État du répertoire applications (forgeReposRoot) côté Forge + sonde Docker OpenClaw (volumes + test -d).
 */
export const GET: APIRoute = async () => {
  try {
    const health = await getForgeReposRootHealth();
    const containerHint = (await getConfig('openclawContainerName')).trim();
    const openclawProbe = await probeOpenClawContainerPath({
      pathToTest: health.path,
      containerNameOverride: containerHint || undefined,
    });
    return new Response(
      JSON.stringify({
        ...health,
        openclawProbe,
        openclawNote:
          openclawProbe.attempted && openclawProbe.pathExistsInContainer
            ? 'Le chemin est visible dans le conteneur OpenClaw (docker exec test -d).'
            : openclawProbe.attempted
              ? 'Forge a pu appeler Docker mais le chemin est absent dans le conteneur ou le conteneur est introuvable — vérifiez les volumes bind (inspect) et le nom du conteneur.'
              : 'Sonde OpenClaw désactivée ou Docker indisponible depuis ce serveur. Vérifiez manuellement les volumes du conteneur OpenClaw.',
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
