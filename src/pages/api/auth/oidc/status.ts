import type { APIRoute } from 'astro';
import { isForgeOidcEnabled } from '../../../../lib/forge-oidc';

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ oidc: isForgeOidcEnabled() }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
