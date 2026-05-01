import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import { eq, desc } from 'drizzle-orm';

export const GET: APIRoute = async ({ url }) => {
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'sessionId requis' }), { status: 400 });
  }

  try {
    const { db, ForgeChatStep } = await loadAstroDb();
    const steps = await db.select().from(ForgeChatStep)
      .where(eq(ForgeChatStep.sessionId, sessionId))
      .orderBy(desc(ForgeChatStep.createdAt));
    
    // On renvoie dans l'ordre chronologique pour le frontend
    return new Response(JSON.stringify({ steps: steps.reverse() }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 });
  }
};
