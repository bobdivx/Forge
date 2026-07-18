import type { APIRoute } from 'astro';
import { getForgeReposRootHealth } from '../../lib/forge-repos-health';
import { getConfig } from '../../lib/config-db';
import { probeOpenClawContainerPath } from '../../lib/openclaw-docker-mounts';

export type BindMountSuggestion = {
  /** Chemin sur l’hôte Docker (à utiliser pour forgeReposRoot si Forge tourne sur cet hôte) */
  hostPath: string;
  /** Chemin dans le conteneur OpenClaw (même contenu) */
  containerPath: string;
};

function buildBindSuggestions(
  mounts: Array<{ source: string; destination: string; type: string }>,
): BindMountSuggestion[] {
  const seen = new Set<string>();
  const out: BindMountSuggestion[] = [];
  for (const m of mounts) {
    if (m.type !== 'bind') continue;
    const hostPath = String(m.source || '').trim();
    const containerPath = String(m.destination || '').trim();
    if (!hostPath || !containerPath) continue;
    const key = `${hostPath}\0${containerPath}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ hostPath, containerPath });
  }
  out.sort((a, b) => a.hostPath.localeCompare(b.hostPath));
  return out;
}

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
    const openclawBindSuggestions = buildBindSuggestions(openclawProbe.mounts ?? []);
    return new Response(
      JSON.stringify({
        ...health,
        openclawProbe,
        openclawBindSuggestions,
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
