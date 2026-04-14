/**
 * Assistant de premier paramétrage (/setup) — état stocké en Config (`forgeSetupState`).
 */
import { getConfig } from './config-db';

export type ForgeSetupState = 'pending' | 'done' | 'skipped';

export async function readForgeSetupState(): Promise<ForgeSetupState> {
  try {
    const v = String(await getConfig('forgeSetupState')).trim().toLowerCase();
    if (v === 'pending' || v === 'skipped') return v;
    return 'done';
  } catch {
    return 'done';
  }
}

/**
 * Redirige vers /setup tant que l’état est `pending` (navigation document uniquement, pas les routes /api).
 */
export async function getForgeSetupRedirect(
  pathname: string,
  request: Request,
): Promise<string | null> {
  if (pathname === '/setup') return null;
  if (pathname.startsWith('/api/')) return null;
  if (pathname.startsWith('/_astro') || pathname === '/favicon.svg') return null;
  const accept = request.headers.get('accept') || '';
  if (!accept.includes('text/html')) return null;

  const st = await readForgeSetupState();
  if (st === 'pending') return '/setup';
  return null;
}
