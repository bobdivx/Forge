import type { APIRoute } from 'astro';
import * as client from 'openid-client';
import {
  assertEmailAllowedForOidc,
  clearOidcTransientCookies,
  getForgeOidcConfiguration,
  isForgeOidcEnabled,
} from '../../../../lib/forge-oidc';
import { createSessionToken, forgeSessionCookieSecure, provisionUserForOidcIfNeeded } from '../../../../lib/auth';

export const GET: APIRoute = async ({ request, redirect, cookies }) => {
  if (!isForgeOidcEnabled()) {
    return new Response('OIDC non configuré', { status: 404 });
  }

  const verifier = cookies.get('forge_oidc_verifier')?.value ?? '';
  const state = cookies.get('forge_oidc_state')?.value ?? '';
  const nonce = cookies.get('forge_oidc_nonce')?.value ?? '';
  if (!verifier || !state || !nonce) {
    clearOidcTransientCookies(cookies);
    return redirect('/login?sso=state');
  }

  try {
    const config = await getForgeOidcConfiguration(request.url);
    const tokens = await client.authorizationCodeGrant(config, request, {
      pkceCodeVerifier: verifier,
      expectedState: state,
      expectedNonce: nonce,
    });

    let email: string | undefined;
    const claims = tokens.claims();
    const claimEmail = claims ? (claims as unknown as { email?: unknown }).email : undefined;
    if (typeof claimEmail === 'string') {
      const raw = claimEmail.trim().toLowerCase();
      if (raw) email = raw;
    }

    if (!email && tokens.access_token) {
      const sub = claims?.sub;
      if (sub && typeof sub === 'string') {
        const ui = await client.fetchUserInfo(config, tokens.access_token, sub);
        if (typeof ui.email === 'string' && ui.email.trim()) {
          email = ui.email.trim().toLowerCase();
        }
      }
    }

    if (!email) {
      clearOidcTransientCookies(cookies);
      return redirect('/login?sso=email');
    }

    assertEmailAllowedForOidc(email);
    await provisionUserForOidcIfNeeded(email);

    const sessionToken = await createSessionToken(email);
    clearOidcTransientCookies(cookies);
    const secure = forgeSessionCookieSecure(request.url);
    cookies.set('forge_session', sessionToken, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure,
      maxAge: 60 * 60 * 12,
    });
    return redirect('/dashboard');
  } catch (e) {
    console.error('[forge] GET /api/auth/oidc/callback', e);
    clearOidcTransientCookies(cookies);
    const code =
      e && typeof e === 'object' && 'code' in e && typeof (e as { code: string }).code === 'string'
        ? (e as { code: string }).code
        : '';
    if (code === 'OIDC_EMAIL_DENIED' || code === 'USER_NOT_PROVISIONED' || code === 'OIDC_INVALID_EMAIL') {
      return redirect(`/login?sso=${encodeURIComponent(code)}`);
    }
    return redirect('/login?sso=error');
  }
};
