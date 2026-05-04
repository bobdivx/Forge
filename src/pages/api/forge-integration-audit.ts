import type { APIRoute } from 'astro';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runZimaosIntegrationScan } from '../../lib/audit-forge-integration-scan';
import {
  FORGE_FACADES_OVER_ZIMAOS,
  FORGE_NATIVE_ROLES,
  ZIMAOS_RUNTIME_ROLES,
} from '../../lib/forge-integration-boundary';

/**
 * Audit statique de la surface ZimaOS dans le dépôt + rappel du contrat d’intégration.
 * À utiliser uniquement depuis l’interface Forge (Paramètres → Infra NAS/Docker).
 */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const here = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.resolve(here, '..', '..');
  const scanned = runZimaosIntegrationScan(srcRoot);

  const gatewayDirectInComponents = scanned.files.filter(
    (f) =>
      f.rel.includes('components/') &&
      f.hits.some((h) => h.pattern === 'import forge-gateway'),
  );

  return new Response(
    JSON.stringify({
      ok: true,
      boundary: {
        zimaosRuntimeRoles: [...ZIMAOS_RUNTIME_ROLES],
        forgeNativeRoles: [...FORGE_NATIVE_ROLES],
        forgeFacades: [...FORGE_FACADES_OVER_ZIMAOS],
      },
      summary: scanned.summary,
      files: scanned.files.map((f) => ({
        path: f.rel,
        hits: f.hits,
      })),
      reviewQueue: {
        componentImportsOfGateway: gatewayDirectInComponents.map((f) => f.rel),
        hint:
          'Les composants UI ne doivent pas importer `forge-gateway` directement — utiliser les routes `/api/*` ou les façades `lib/forge-*`. Tout se pilote depuis Forge.',
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
