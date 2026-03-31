// @ts-nocheck
import type { APIRoute } from 'astro';
import { createSessionToken, verifyCredentials, isValidEmail, isValidPassword } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  console.log('Login attempt received');
  const body = await request.json().catch((err) => {
    console.error('Failed to parse login body', err);
    return {};
  });
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');
  console.log(`Attempting login for: ${email}`);

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return new Response(JSON.stringify({ error: 'Identifiants invalides' }), { status: 400 });
  }

  if (!verifyCredentials(email, password)) {
    return new Response(JSON.stringify({ error: 'Email ou mot de passe incorrect' }), { status: 401 });
  }

  const token = createSessionToken(email);
  cookies.set('forge_session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax', // Plus tolérant pour la redirection locale
    secure: false,   // Désactivé pour le HTTP local (NAS)
    maxAge: 60 * 60 * 12
  });

  return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
};
