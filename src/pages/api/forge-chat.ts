import type { APIRoute } from 'astro';
import { asc, desc, eq } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import { runForgeOrchestrator } from '../../lib/forge-orchestrator';

const MAX_MESSAGE = 120_000;

function normalizeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sessionId = String(body.sessionId || body.sessionKey || '').trim();
  const agentId = String(body.agentId || sessionId || '').trim();
  const message = String(body.message || '').trim();
  const modelHint = String(body.modelHint || '').trim() || undefined;
  const projectId = typeof body.projectId === 'number' ? body.projectId : undefined;
  const requestId = typeof body.requestId === 'number' ? body.requestId : undefined;

  if (!sessionId || !agentId || !message) {
    return new Response(JSON.stringify({ error: 'sessionId/agentId/message requis' }), { status: 400 });
  }
  if (message.length > MAX_MESSAGE) {
    return new Response(JSON.stringify({ error: 'Message trop long' }), { status: 400 });
  }

  try {
    const { db, ForgeChatSession, ForgeChatMessage, ForgeChatStep } = await loadAstroDb();
    const now = new Date();
    const turnId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const existing = await db.select().from(ForgeChatSession).where(eq(ForgeChatSession.id, sessionId));
    if (!existing.length) {
      await db.insert(ForgeChatSession).values({
        id: sessionId,
        agentId,
        projectId,
        requestId,
        title: `Session ${agentId}`,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await db.update(ForgeChatSession).set({ updatedAt: now }).where(eq(ForgeChatSession.id, sessionId));
    }

    // Le polling de la page Discussion lit les steps par session. On repart à zéro
    // pour éviter d'afficher les anciennes cartes d'activité pendant un nouveau tour.
    await db.delete(ForgeChatStep).where(eq(ForgeChatStep.sessionId, sessionId));

    await db.insert(ForgeChatMessage).values({
      sessionId,
      role: 'user',
      content: message,
      meta: JSON.stringify({ author: locals.user.email }),
      createdAt: now,
    });

    const orchestrated = await runForgeOrchestrator({ 
      agentId, 
      message, 
      modelHint, 
      projectId,
      sessionId: sessionId,
      turnId,
    });
    await db.insert(ForgeChatMessage).values({
      sessionId,
      role: 'assistant',
      content: orchestrated.reply,
      provider: orchestrated.provider,
      model: orchestrated.model,
      meta: JSON.stringify({ turnId, steps: orchestrated.steps, toolResult: orchestrated.toolResult || null }),
      createdAt: new Date(),
    });

    if (orchestrated.plan && orchestrated.plan.length > 0 && projectId) {
      const { Request } = await loadAstroDb();
      const planRequests = orchestrated.plan.map((item) => ({
        projectId,
        title: item.title,
        content: item.content || `Tâche issue du plan de ${agentId}`,
        status: 'pending',
        priority: 'medium',
        author: agentId,
        requestType: 'Correction',
        assigneeAgentId: item.assignee || undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      await db.insert(Request).values(planRequests);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        via: 'forge-chat',
        sessionId,
        turnId,
        result: { status: 'completed', reply: orchestrated.reply },
        steps: orchestrated.steps,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    console.error('[forge-chat] Fatal error:', e);
    return new Response(JSON.stringify({ error: normalizeError(e) }), { status: 502 });
  }
};

export const GET: APIRoute = async ({ request, locals }) => {
  if (!locals.user?.email) {
    return new Response(JSON.stringify({ error: 'Non authentifié' }), { status: 401 });
  }
  const url = new URL(request.url);
  const sessionId = String(url.searchParams.get('sessionId') || url.searchParams.get('sessionKey') || '').trim();
  const limitRaw = Number(url.searchParams.get('limit') || 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 100;
  if (!sessionId) return new Response(JSON.stringify({ error: 'sessionId requis' }), { status: 400 });

  try {
    const { db, ForgeChatMessage, ForgeChatStep } = await loadAstroDb();
    const rows = await db
      .select()
      .from(ForgeChatMessage)
      .where(eq(ForgeChatMessage.sessionId, sessionId))
      .orderBy(desc(ForgeChatMessage.createdAt))
      .limit(limit);
    const steps = await db
      .select()
      .from(ForgeChatStep)
      .where(eq(ForgeChatStep.sessionId, sessionId))
      .orderBy(asc(ForgeChatStep.createdAt));
    return new Response(
      JSON.stringify({
        ok: true,
        sessionId,
        messages: rows.reverse().map((r) => {
          let meta: Record<string, unknown> = {};
          try {
            meta = r.meta ? JSON.parse(r.meta) as Record<string, unknown> : {};
          } catch {}
          return {
            id: `forge-msg-${r.id}`,
            role: r.role,
            text: r.content,
            at: new Date(r.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            meta: r.meta || null,
            provider: r.provider || null,
            model: r.model || null,
            steps: Array.isArray(meta.steps) ? meta.steps : undefined,
            turnId: typeof meta.turnId === 'string' ? meta.turnId : undefined,
          };
        }),
        steps,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: normalizeError(e) }), { status: 500 });
  }
};

