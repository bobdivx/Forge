import type { APIRoute } from 'astro';
import {
  registerOrReplaceUser,
  createSessionToken,
  getUser,
  isValidEmail,
  isValidPassword,
  forgeSessionCookieSecure,
  migrateLegacyAuthOnce,
} from '../../../lib/auth';

function registerErrorMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/SQLITE_READONLY|readonly|EROFS|read-only|READONLY/i.test(m)) {
    return 'La base de données est en lecture seule. Sur le NAS, vérifiez que le dossier monté sur /app/.astro (et éventuellement /app/.data) appartient au même utilisateur que le processus dans le conteneur, ou les permissions chmod/chown.';
  }
  if (/SQLITE_CANTOPEN|unable to open database|no such file|ENOENT/i.test(m)) {
    return 'Impossible d’ouvrir le fichier de base Astro (.astro). Vérifiez que le volume hôte existe, est monté sur /app/.astro et que le conteneur y a accès en écriture.';
  }
  if (/SQLITE_BUSY|database is locked|LIBSQL|libsql/i.test(m)) {
    return 'Base de données temporairement verrouillée. Réessayez dans quelques secondes ou redémarrez le conteneur Forge.';
  }
  return 'Erreur serveur lors de la création du compte. Consultez les logs du conteneur (docker logs forge) pour le détail technique.';
}

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    await migrateLegacyAuthOnce();

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
  } catch (e: unknown) {
    console.error('[forge] POST /api/auth/register', e);
    return new Response(JSON.stringify({ error: registerErrorMessage(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
