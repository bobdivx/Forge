import type { APIRoute } from 'astro';
import * as client from 'openid-client';
import {
  forgeOidcAuthCookieOptions,
  forgeOidcScopes,
  getForgeOidcConfiguration,
  isForgeOidcEnabled,
  resolveForgeOidcRedirectUri,
} from '../../../../lib/forge-oidc';

export const GET: APIRoute = async ({ request, redirect, cookies }) => {
  if (!isForgeOidcEnabled()) {
    return new Response(JSON.stringify({ error: 'OIDC non configuré.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  try {
    const config = await getForgeOidcConfiguration(request.url);
    const redirectUri = resolveForgeOidcRedirectUri(request.url);
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);
    const state = client.randomState();
    const nonce = client.randomNonce();
    const cookieOpts = forgeOidcAuthCookieOptions(request.url);

    cookies.set('forge_oidc_verifier', codeVerifier, cookieOpts);
    cookies.set('forge_oidc_state', state, cookieOpts);
    cookies.set('forge_oidc_nonce', nonce, cookieOpts);

    const authorizationUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: redirectUri,
      scope: forgeOidcScopes(),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
      nonce,
    });
    return redirect(authorizationUrl.toString());
  } catch (e) {
    console.error('[forge] GET /api/auth/oidc/login', e);
    return new Response(JSON.stringify({ error: 'Impossible de démarrer la connexion SSO.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
