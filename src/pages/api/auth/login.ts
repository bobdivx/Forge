import type { APIRoute } from 'astro';
import {
  createSessionToken,
  verifyCredentials,
  forgeSessionCookieSecure,
  getCredentialsValidationError,
  getUser,
  hasUser,
} from '../../../lib/auth';

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email ?? '').trim().toLowerCase();
    const password = String(body?.password ?? '').trim();

    const validationErr = getCredentialsValidationError(email, password);
    if (validationErr) {
      return new Response(JSON.stringify({ error: validationErr }), { status: 400 });
    }

    if (!(await verifyCredentials(email, password))) {
      const existing = await getUser(email);
      const anyAccount = await hasUser();
      let error = 'Email ou mot de passe incorrect.';
      if (!anyAccount) {
        error =
          'Aucun compte en base (table ForgeUser / fichier .astro/content.db). Utilisez l’onglet « Créer un compte » ou restaurez une sauvegarde de la base.';
      } else if (!existing) {
        error = 'Aucun compte pour cet e-mail — vérifiez l’adresse ou créez un compte.';
      }
      return new Response(JSON.stringify({ error }), { status: 401 });
    }

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
  } catch (e: unknown) {
    console.error('[forge] POST /api/auth/login', e);
    return new Response(
      JSON.stringify({
        error:
          'Erreur serveur à la connexion (base Astro ou session). Vérifiez le volume /app/.astro sur le NAS et les logs du conteneur.',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
};
