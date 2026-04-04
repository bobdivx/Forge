import type { APIRoute } from 'astro';
import {
  listCustomTokensForUi,
  syncCustomTokensFromClient,
  type CustomTokenItemInput,
} from '../../lib/custom-api-tokens-db';

/** Liste des jetons personnalisés (sans exposer les secrets). */
export const GET: APIRoute = async () => {
  try {
    const items = await listCustomTokensForUi();
    return new Response(JSON.stringify({ items }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

/**
 * Remplace la liste des jetons personnalisés.
 * Body: { items: [{ id?, key, label?, secret? }] } — secret vide sur une ligne existante = inchangé.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const raw = body?.items;
    if (!Array.isArray(raw)) {
      return new Response(JSON.stringify({ error: 'items[] requis' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const items: CustomTokenItemInput[] = raw.map((x: Record<string, unknown>) => ({
      id: typeof x.id === 'number' ? x.id : undefined,
      key: String(x.key ?? ''),
      label: String(x.label ?? ''),
      secret: String(x.secret ?? ''),
    }));
    await syncCustomTokensFromClient(items);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Échec de sauvegarde';
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
