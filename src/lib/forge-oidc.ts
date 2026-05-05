/**
 * Configuration OIDC / SSO pour Forge (OpenID Connect, flux code + PKCE).
 *
 * Variables d'environnement :
 * - FORGE_OIDC_ISSUER : URL de l'émetteur (ex. https://keycloak.example/realms/forge)
 * - FORGE_OIDC_CLIENT_ID : identifiant client OIDC
 * - FORGE_OIDC_CLIENT_SECRET : secret (optionnel — client public si absent)
 * - FORGE_OIDC_REDIRECT_URI : URL complète du callback (recommandé en prod derrière un reverse proxy)
 * - FORGE_OIDC_SCOPES : défaut « openid email profile »
 * - FORGE_OIDC_ALLOWED_EMAIL_DOMAINS : liste séparée par des virgules (ex. « acme.com,partner.org »)
 * - FORGE_OIDC_REQUIRE_EXISTING_USER : « 1 » pour refuser la connexion si l'e-mail n'existe pas en ForgeUser
 * - FORGE_OIDC_ALLOW_INSECURE : « 1 » pour autoriser issuer HTTP (dev uniquement)
 */
import * as client from 'openid-client';
import { forgeSessionCookieSecure } from './auth';

const OIDC_COOKIE_MAX_AGE_SEC = 600;

export { forgeSessionCookieSecure as forgeOidcCookieSecure };

export function isForgeOidcEnabled(): boolean {
  const issuer = String(process.env.FORGE_OIDC_ISSUER || '').trim();
  const clientId = String(process.env.FORGE_OIDC_CLIENT_ID || '').trim();
  return Boolean(issuer && clientId);
}

/** URL de callback enregistrée chez le fournisseur OIDC. */
export function resolveForgeOidcRedirectUri(requestUrl: string): string {
  const fromEnv = String(process.env.FORGE_OIDC_REDIRECT_URI || '').trim();
  if (fromEnv) return fromEnv;
  const base = new URL(requestUrl);
  return `${base.origin}/api/auth/oidc/callback`;
}

export function forgeOidcScopes(): string {
  const s = String(process.env.FORGE_OIDC_SCOPES || '').trim();
  return s || 'openid email profile';
}

function parseAllowedEmailDomains(): string[] {
  const raw = String(process.env.FORGE_OIDC_ALLOWED_EMAIL_DOMAINS || '').trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function assertEmailAllowedForOidc(email: string): void {
  const domains = parseAllowedEmailDomains();
  if (!domains.length) return;
  const at = String(email || '').toLowerCase().indexOf('@');
  if (at < 0) {
    const err = new Error("L'identité SSO ne contient pas d'adresse e-mail utilisable.");
    (err as Error & { code?: string }).code = 'OIDC_EMAIL_DENIED';
    throw err;
  }
  const dom = String(email).slice(at + 1).toLowerCase();
  if (!domains.includes(dom)) {
    const err = new Error(
      `Ce domaine e-mail n'est pas autorisé pour la connexion SSO (${domains.join(', ')}).`,
    );
    (err as Error & { code?: string }).code = 'OIDC_EMAIL_DENIED';
    throw err;
  }
}

let _oidcConfigPromise: Promise<Awaited<ReturnType<typeof client.discovery>>> | null = null;
let _oidcCacheKey = '';

export function getForgeOidcConfiguration(
  requestUrlForRedirect: string,
): Promise<Awaited<ReturnType<typeof client.discovery>>> {
  const issuerRaw = String(process.env.FORGE_OIDC_ISSUER || '').trim();
  const clientId = String(process.env.FORGE_OIDC_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.FORGE_OIDC_CLIENT_SECRET || '').trim();
  const redirectUri = resolveForgeOidcRedirectUri(requestUrlForRedirect);
  const cacheKey = `${issuerRaw}|${clientId}|${clientSecret ? '1' : '0'}|${redirectUri}`;

  if (_oidcConfigPromise && _oidcCacheKey === cacheKey) {
    return _oidcConfigPromise;
  }

  _oidcCacheKey = cacheKey;
  _oidcConfigPromise = (async () => {
    let issuerUrl: URL;
    try {
      issuerUrl = new URL(issuerRaw.endsWith('/') ? issuerRaw.slice(0, -1) : issuerRaw);
    } catch {
      throw new Error('FORGE_OIDC_ISSUER invalide (URL attendue).');
    }

    const allowInsecure =
      String(process.env.FORGE_OIDC_ALLOW_INSECURE || '').trim() === '1' || issuerUrl.protocol === 'http:';

    const discoveryOpts: client.DiscoveryRequestOptions = {};
    if (allowInsecure) {
      discoveryOpts.execute = [client.allowInsecureRequests];
    }

    const meta: Partial<client.ClientMetadata> = { redirect_uris: [redirectUri] };

    if (clientSecret) {
      return client.discovery(issuerUrl, clientId, { ...meta, client_secret: clientSecret }, client.ClientSecretPost(clientSecret), discoveryOpts);
    }
    return client.discovery(issuerUrl, clientId, meta, client.None(), discoveryOpts);
  })();

  return _oidcConfigPromise;
}

export function forgeOidcAuthCookieOptions(requestUrl: string) {
  const secure = forgeSessionCookieSecure(requestUrl);
  return {
    path: '/' as const,
    httpOnly: true,
    sameSite: 'lax' as const,
    secure,
    maxAge: OIDC_COOKIE_MAX_AGE_SEC,
  };
}

export function clearOidcTransientCookies(cookies: {
  delete: (name: string, options: { path: string }) => void;
}) {
  const path = '/';
  cookies.delete('forge_oidc_verifier', { path });
  cookies.delete('forge_oidc_state', { path });
  cookies.delete('forge_oidc_nonce', { path });
}
