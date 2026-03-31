// @ts-nocheck
import type { APIRoute } from 'astro';
import { createSessionToken, isValidEmail, isValidPassword, registerOrReplaceUser, verifyCredentials } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies, locals }) => {
  const body = await request.json().catch(() => ({}));
  const currentEmail = String(locals?.user?.email ?? '').trim().toLowerCase();
  const currentPassword = String(body?.currentPassword ?? '');
  const newEmail = String(body?.newEmail ?? '').trim().toLowerCase();
  const newPassword = String(body?.newPassword ?? '');

  if (!currentEmail || !verifyCredentials(currentEmail, currentPassword)) {
    return new Response(JSON.stringify({ error: 'Mot de passe actuel invalide' }), { status: 401 });
  }
  if (!isValidEmail(newEmail)) {
    return new Response(JSON.stringify({ error: 'Nouvel email invalide' }), { status: 400 });
  }
  if (!isValidPassword(newPassword)) {
    return new Response(JSON.stringify({ error: 'Nouveau mot de passe trop court (minimum 10 caracteres)' }), { status: 400 });
  }

  registerOrReplaceUser(newEmail, newPassword);
  const token = createSessionToken(newEmail);
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
