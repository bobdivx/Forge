// @ts-nocheck
import type { APIRoute } from 'astro';
import { createSessionToken, verifyCredentials, isValidEmail, isValidPassword } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return new Response(JSON.stringify({ error: 'Identifiants invalides' }), { status: 400 });
  }

  if (!verifyCredentials(email, password)) {
    return new Response(JSON.stringify({ error: 'Email ou mot de passe incorrect' }), { status: 401 });
  }

  const token = createSessionToken(email);
  const secure = process.env.NODE_ENV === 'production';
  cookies.set('forge_session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'strict',
    secure,
    maxAge: 60 * 60 * 12
  });

  return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
};
