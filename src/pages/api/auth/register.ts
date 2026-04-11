import type { APIRoute } from 'astro';
import {
  registerOrReplaceUser,
  createSessionToken,
  getUser,
  isValidEmail,
  isValidPassword,
  forgeSessionCookieSecure,
} from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? '').trim().toLowerCase();
  const password = String(body?.password ?? '').trim();

  if (!isValidEmail(email) || !isValidPassword(password)) {
    return new Response(JSON.stringify({ error: 'Identifiants invalides' }), { status: 400 });
  }

  /** Ne jamais écraser un compte existant depuis « Créer un compte » (sinon l’ancien mot de passe ne marche plus). */
  if (await getUser(email)) {
    return new Response(
      JSON.stringify({
        error:
          'Un compte existe déjà avec cet e-mail. Utilisez l’onglet Connexion, ou réinitialisez le mot de passe depuis les paramètres une fois connecté.',
      }),
      { status: 409 },
    );
  }

  await registerOrReplaceUser(email, password);

  const token = await createSessionToken(email);
  const secure = forgeSessionCookieSecure(request.url);
  cookies.set('forge_session', token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: 60 * 60 * 12,
  });

  return new Response(JSON.stringify({ status: 'ok' }), { status: 200 });
};
