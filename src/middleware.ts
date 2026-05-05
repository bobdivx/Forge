// @ts-nocheck
import { defineMiddleware } from 'astro:middleware';
import { verifySessionToken } from './lib/auth';
import { getConfig } from './lib/config-db';
import { ensureAstroLocalDbSchemaOnce } from './lib/forge-astro-db-bootstrap';
import { getForgeSetupRedirect } from './lib/forge-setup';
import { startScheduler } from './lib/forge-work-scheduler';
import { startBugDetector } from './lib/forge-bug-detector';

/** D\u00e9marrage du scheduler et du bug detector une seule fois apr\u00e8s que la DB est pr\u00eate. */
let _schedulerBooted = false;
function ensureSchedulerOnce() {
  // On force le reboot si le code a \u00e9t\u00e9 modifi\u00e9
  if (_schedulerBooted) return;
  _schedulerBooted = true;
  // Démarre après un court délai pour laisser le bootstrap DB se terminer
  setTimeout(() => {
    startScheduler();
    startBugDetector();
    void (async () => {
      try {
        const { loadAstroDb } = await import('./lib/load-astro-db');
        const { eq } = await import('drizzle-orm');
        const { db, Project } = await loadAstroDb();
        const rows = await db.select({ id: Project.id }).from(Project).where(eq(Project.swarmEnabled, 1));
        if (rows.length === 0) {
          console.warn(
            '[forge] Aucun projet avec swarm activé : aucune AgentAppIssue ne sera dispatchée tant que le toggle « swarm » reste désactivé sur tous les dépôts.',
          );
        }
      } catch (e) {
        console.warn('[forge] Vérification projets swarm au boot :', e);
      }
    })();
  }, 8_000);
}

const PUBLIC_PATHS = [
  '/api/agents',
  '/api/models',
  '/api/forge-steer',
  '/api/forge-health',
  '/api/forge-activity',
  '/api/forge-orchestration',
  '/api/forge-economics-stats',
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
  '/api/config/secrets',
  '/api/docker-health',
  '/api/system-status',
  '/api/dump-config',
  '/api/work-system',
  '/api/work-schedules',
  // ACCÈS TOTAL : permet aux agents (en local ou avec X-Forge-Token) de gérer
  // eux-mêmes le catalogue d'outils, leurs assignations, leurs propres règles
  // et leurs propres prompts/modèles.
  '/api/agent-tools',
  '/api/agent-tool-assignments',
  '/api/agent-instructions',
  '/api/agent-rules',
  '/api/agent-action-doctrine',
  '/api/agent-default-model',
  '/api/agent-template-models',
  '/api/agent-model-cascade',
  '/api/forge-agent-models',
  '/api/forge-agent-profiles',
  '/api/forge-agent-sanity',
  '/api/forge-agent-model-ping',
  '/api/forge-sync-agents',
  '/api/forge-wake-agents',
  '/api/forge-directive',
  '/api/forge-chat',
  '/api/forge-orchestration',
  '/api/forge-needs',
  '/api/projects-db',
  '/api/work-overview',
  '/api/work-tasks-actions',
  '/api/work-items-actions',
  '/api/discussion-history',
  '/api/discussion-poll',
  '/api/discussion-steps',
  '/api/models',
  '/api/ollama-instances',
  '/api/gemini-models',
  '/api/git-commit',
  '/api/github-repos',
  '/api/github-clone',
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

function extractBearerToken(value: string | null): string {
  if (!value) return '';
  const s = value.trim();
  if (!s) return '';
  const m = /^Bearer\s+(.+)$/i.exec(s);
  return (m?.[1] || s).trim();
}

async function hasForgeAgentToken(request: Request): Promise<boolean> {
  let expected = String(process.env.FORGE_API_TOKEN || '').trim();
  if (!expected) {
    try {
      expected = String(await getConfig('forgeApiToken')).trim();
    } catch {
      expected = '';
    }
  }
  if (!expected) return false;
  const candidates = [
    extractBearerToken(request.headers.get('authorization')),
    extractBearerToken(request.headers.get('x-forge-token')),
    extractBearerToken(request.headers.get('x-agent-token')),
  ].filter(Boolean);
  return candidates.includes(expected);
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
    (isLocalRequest(context.request, clientIp) || (await hasForgeAgentToken(context.request)))
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
