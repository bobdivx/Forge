import type { APIRoute } from 'astro';
import { db, AgentMemory, eq, desc } from 'astro:db';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** GET ?agentId=xxx — liste les mémoires d'un agent. */
export const GET: APIRoute = async ({ url }) => {
  const agentId = url.searchParams.get('agentId');
  if (!agentId) return json({ error: 'Paramètre agentId requis' }, 400);

  try {
    const memories = await db
      .select()
      .from(AgentMemory)
      .where(eq(AgentMemory.agentId, agentId))
      .orderBy(desc(AgentMemory.createdAt))
      .limit(100);
    return json({ memories });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
};

/** POST { agentId, content, tags? } — crée une mémoire. */
export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Corps JSON invalide' }, 400);
  }

  const { agentId, content, tags } = body ?? {};
  if (!agentId || !content)
    return json({ error: 'agentId et content sont requis' }, 400);

  try {
    const [inserted] = await db
      .insert(AgentMemory)
      .values({
        agentId: String(agentId),
        content: String(content),
        tags: tags ? JSON.stringify(tags) : null,
        createdAt: new Date(),
      })
      .returning();
    return json({ ok: true, memory: inserted });
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
};

/** DELETE ?agentId=xxx — efface toutes les mémoires d'un agent.
 *  DELETE ?id=42      — supprime une mémoire par ID.
 */
export const DELETE: APIRoute = async ({ url }) => {
  const id = url.searchParams.get('id');
  const agentId = url.searchParams.get('agentId');

  try {
    if (id) {
      const numId = parseInt(id, 10);
      if (isNaN(numId)) return json({ error: 'ID invalide' }, 400);
      await db.delete(AgentMemory).where(eq(AgentMemory.id, numId));
      return json({ ok: true, deleted: numId });
    }
    if (agentId) {
      await db.delete(AgentMemory).where(eq(AgentMemory.agentId, agentId));
      return json({ ok: true, deleted: agentId });
    }
    return json({ error: 'Paramètre id ou agentId requis' }, 400);
  } catch (e: any) {
    return json({ error: e.message }, 500);
  }
};
