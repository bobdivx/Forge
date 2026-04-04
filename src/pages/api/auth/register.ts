import type { APIRoute } from 'astro';
import { registerOrReplaceUser, createSessionToken, isValidEmail, isValidPassword } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '');

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return new Response(JSON.stringify({ error: 'Identifiants invalides' }), { status: 400 });
  }

  await registerOrReplaceUser(email, password);

  const token = await createSessionToken(email);
  const secure = process.env.NODE_ENV === 'production';
  cookies.set('forge_session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 60 * 60 * 12,
  });

  return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
};
