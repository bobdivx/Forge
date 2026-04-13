// @ts-nocheck
import { defineMiddleware } from 'astro:middleware';
import { verifySessionToken } from './lib/auth';
import { ensureAstroLocalDbSchemaOnce } from './lib/forge-astro-db-bootstrap';
import { getForgeSetupRedirect } from './lib/forge-setup';
import { startScheduler } from './lib/forge-work-scheduler';
import { startBugDetector } from './lib/forge-bug-detector';

/** Démarrage du scheduler et du bug detector une seule fois après que la DB est prête. */
let _schedulerBooted = false;
function ensureSchedulerOnce() {
  if (_schedulerBooted) return;
  _schedulerBooted = true;
  // Démarre après un court délai pour laisser le bootstrap DB se terminer
  setTimeout(() => {
    startScheduler();
    startBugDetector();
  }, 8_000);
}

const PUBLIC_PATHS = [
  '/api/agents',
  '/api/models',
  '/api/openclaw-steer',
  '/api/openclaw-health',
  '/api/openclaw-activity',
  '/api/openclaw-orchestration',
  '/api/openclaw-economics-stats',
  '/login',
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/forge-hook',
  '/api/db-test',
  // Endpoints écriture accessibles depuis le navigateur (formulaires du dashboard)
  '/api/agent-issues',
  '/api/agent-dependencies',
  '/api/agent-proposals',
  '/api/audit-launch',
  // Webhook GitHub (PR Jules) — signature HMAC, pas de session
  '/api/webhooks/github-jules',
];

/** Endpoints appelables depuis le réseau local sans session (agents Ollama). */
const LOCAL_ONLY_PATHS = [
  '/api/forge-hook',
  '/api/agent-tasks',
  '/api/agent-memory',
  '/api/agent-repl',
  '/api/forge-tools',
  '/api/agent-api-secrets',
  '/api/docker-health',
  '/api/work-system',
  '/api/work-schedules',
];

function normalizeClientIp(raw: string | undefined): string {
  if (!raw) return '';
  const s = raw.trim();
  return s.startsWith('::ffff:') ? s.slice(7) : s;
}

function isLocalIp(ip: string): boolean {
  if (!ip) return false;
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.')
  );
}

/** IP depuis reverse-proxy, sinon socket (astro dev / curl sans X-Forwarded-For). */
function isLocalRequest(request: Request, clientAddress?: string): boolean {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const fromHeader =
    normalizeClientIp(forwarded?.split(',')[0]?.trim()) || normalizeClientIp(realIp ?? undefined);
  if (isLocalIp(fromHeader)) return true;
  return isLocalIp(normalizeClientIp(clientAddress));
}

/** Prérendu / build : `clientAddress` n'existe pas (voir PrerenderClientAddressNotAvailable). */
function getClientAddressSafe(context: { clientAddress: string }): string {
  try {
    return context.clientAddress ?? '';
  } catch {
    return '';
  }
}

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'))) {
    return true;
  }
  return pathname.startsWith('/_astro') || pathname === '/favicon.svg';
}

export const onRequest = defineMiddleware(async (context, next) => {
  try {
    await ensureAstroLocalDbSchemaOnce();
    ensureSchedulerOnce();
  } catch (e) {
    console.error('[forge] ensureAstroLocalDbSchemaOnce (schéma Astro DB)', e);
  }

  const { pathname } = context.url;
  const clientIp = getClientAddressSafe(context);

  if (isPublic(pathname)) {
    return next();
  }

  // Agents locaux (Ollama sur le même serveur) peuvent appeler les endpoints
  // de reporting sans cookie de session.
  if (
    LOCAL_ONLY_PATHS.some((p) => pathname.startsWith(p)) &&
    isLocalRequest(context.request, clientIp)
  ) {
    context.locals.user = { email: 'agent@forge.local' };
    return next();
  }

  // Vérification session — wrappée pour éviter qu'une erreur DB retourne du HTML
  let session = { valid: false, email: undefined };
  try {
    const token = context.cookies.get('forge_session')?.value ?? '';
    if (token) {
      session = await verifySessionToken(token);
    }
  } catch {
    /* DB indisponible → session invalide, gérée ci-dessous */
  }

  if (session.valid) {
    context.locals.user = { email: session.email };
    try {
      const setupRedir = await getForgeSetupRedirect(pathname, context.request);
      if (setupRedir) {
        return context.redirect(setupRedir);
      }
    } catch {
      /* DB indisponible : on laisse passer */
    }
    return next();
  }

  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Non authentifie' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return context.redirect('/login');
});
