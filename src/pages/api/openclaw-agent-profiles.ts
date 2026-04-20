import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';

function clean(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t ? t : null;
}

function normalizeHttpsUrl(s: string | null): string | null {
  if (!s) return null;
  if (!/^https:\/\//i.test(s)) return null;
  return s.slice(0, 2048);
}

/**
 * Fiches persistantes pour les **sessions OpenClaw** (clé = `sessionKey` du gateway).
 * GET : toutes les fiches (petit volume). POST : upsert pour une session.
 */
export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }
  try {
    const { db, OpenClawAgentProfile } = await loadAstroDb();
    const rows = await db.select().from(OpenClawAgentProfile);
    const profiles: Record<string, Record<string, unknown>> = {};
    for (const r of rows) {
      profiles[r.sessionKey] = {
        sessionKey: r.sessionKey,
        displayName: r.displayName ?? null,
        roleTitle: r.roleTitle ?? null,
        bio: r.bio ?? null,
        avatarUrl: r.avatarUrl ?? null,
        avatarEmoji: r.avatarEmoji ?? null,
        updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : String(r.updatedAt),
      };
    }
    return new Response(JSON.stringify({ profiles }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur base';
    return new Response(JSON.stringify({ profiles: {}, error: msg }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const sessionKey = typeof body?.sessionKey === 'string' ? body.sessionKey.trim() : '';
  if (!sessionKey) {
    return new Response(JSON.stringify({ error: 'sessionKey requis' }), { status: 400 });
  }

  const displayName = clean(body?.displayName);
  const roleTitle = clean(body?.roleTitle);
  const bio = clean(body?.bio);
  const bioClamped = bio && bio.length > 4000 ? bio.slice(0, 4000) : bio;
  const avatarUrl = normalizeHttpsUrl(clean(body?.avatarUrl));
  let avatarEmoji = clean(body?.avatarEmoji);
  if (avatarEmoji && avatarEmoji.length > 16) avatarEmoji = avatarEmoji.slice(0, 16);

  const now = new Date();

  try {
    const { db, OpenClawAgentProfile } = await loadAstroDb();
    const existing = await db
      .select()
      .from(OpenClawAgentProfile)
      .where(eq(OpenClawAgentProfile.sessionKey, sessionKey))
      .limit(1);

    const payload = {
      sessionKey,
      displayName,
      roleTitle,
      bio: bioClamped,
      avatarUrl,
      avatarEmoji,
      updatedAt: now,
    };

    if (existing.length) {
      await db.update(OpenClawAgentProfile).set(payload).where(eq(OpenClawAgentProfile.sessionKey, sessionKey));
    } else {
      await db.insert(OpenClawAgentProfile).values(payload);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        profile: {
          sessionKey,
          displayName,
          roleTitle,
          bio: bioClamped,
          avatarUrl,
          avatarEmoji,
          updatedAt: now.toISOString(),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Erreur base';
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
