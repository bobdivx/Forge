import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import { runForgeOrchestrator, type ForgeOrchestratorOutput } from '../../lib/forge-orchestrator';

const MAX_MESSAGE = 120_000;

function normalizeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(sse(event, data)));
      };

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

        await db.delete(ForgeChatStep).where(eq(ForgeChatStep.sessionId, sessionId));
        await db.insert(ForgeChatMessage).values({
          sessionId,
          role: 'user',
          content: message,
          meta: JSON.stringify({ author: locals.user?.email, turnId }),
          createdAt: now,
        });

        send('start', { ok: true, sessionId, turnId });

        const orchestrated = await runForgeOrchestrator({
          agentId,
          message,
          modelHint,
          projectId,
          sessionId,
          turnId,
          onStep: (step: ForgeOrchestratorOutput['steps'][0]) => send('step', step),
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
          for (const item of orchestrated.plan) {
            await db.insert(Request).values({
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
            });
          }
        }

        send('done', {
          ok: true,
          via: 'forge-chat-stream',
          sessionId,
          turnId,
          result: { status: 'completed', reply: orchestrated.reply },
          steps: orchestrated.steps,
        });
      } catch (e) {
        send('error', { ok: false, error: normalizeError(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
};
