// @ts-nocheck
import type { APIRoute } from 'astro';
import { registerOrReplaceUser, createSessionToken, isValidEmail, isValidPassword } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return new Response(JSON.stringify({ error: 'Identifiants invalides' }), { status: 400 });
  }

  registerOrReplaceUser(email, password);
  
  const token = createSessionToken(email);
  cookies.set('forge_session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    maxAge: 60 * 60 * 12
  });

  return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
};
