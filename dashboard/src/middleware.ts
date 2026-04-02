// @ts-nocheck
import { defineMiddleware } from 'astro:middleware';
import { verifySessionToken } from './lib/auth';

const PUBLIC_PATHS = ['/api/agents', '/api/models', '/api/openclaw-steer', '/api/openclaw-health', '/api/openclaw-activity', '/api/openclaw-orchestration', '/api/openclaw-economics-stats', '/login', '/api/auth/login', '/api/auth/register', '/api/auth/logout'];

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
