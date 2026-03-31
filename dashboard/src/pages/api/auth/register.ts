// @ts-nocheck
import type { APIRoute } from 'astro';
import { createSessionToken, isValidEmail, isValidPassword, registerOrReplaceUser } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  if (!isValidEmail(email)) {
    return new Response(JSON.stringify({ error: 'Email invalide' }), { status: 400 });
  }
  if (!isValidPassword(password)) {
    return new Response(JSON.stringify({ error: 'Mot de passe trop court (minimum 10 caracteres)' }), { status: 400 });
  }

  registerOrReplaceUser(email, password);
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
