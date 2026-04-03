// @ts-nocheck
import { defineMiddleware } from 'astro:middleware';
import { verifySessionToken } from './lib/auth';

const PUBLIC_PATHS = ['/api/agents', '/api/models', '/api/openclaw-steer', '/api/openclaw-health', '/api/openclaw-activity', '/api/openclaw-orchestration', '/api/openclaw-economics-stats', '/login', '/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/forge-hook'];

/** Endpoints appelables depuis le réseau local sans session (agents Ollama). */
const LOCAL_ONLY_PATHS = ['/api/forge-hook', '/api/agent-tasks', '/api/agent-memory', '/api/agent-repl', '/api/forge-tools'];

function isLocalRequest(request: Request): boolean {
  const forwarded = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const ip = forwarded?.split(',')[0].trim() ?? realIp ?? '';
  return (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.')
  );
}

function isPublic(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) {
    return true;
  }
  return pathname.startsWith('/_astro') || pathname === '/favicon.svg';
}

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  if (isPublic(pathname)) {
    return next();
  }

  // Agents locaux (Ollama sur le même serveur) peuvent appeler les endpoints
  // de reporting sans cookie de session.
  if (LOCAL_ONLY_PATHS.some((p) => pathname.startsWith(p)) && isLocalRequest(context.request)) {
    context.locals.user = { email: 'agent@forge.local' };
    return next();
  }

  const token = context.cookies.get('forge_session')?.value ?? '';
  const session = verifySessionToken(token);

  if (session.valid) {
    context.locals.user = { email: session.email };
    return next();
  }

  if (pathname.startsWith('/api/')) {
    return new Response(JSON.stringify({ error: 'Non authentifie' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  return context.redirect('/login');
});
