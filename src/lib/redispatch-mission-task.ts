import { loadAstroDb } from './load-astro-db';
import { invokeOpenClawSessionsSend, resolveSessionsSendKey } from './openclaw-gateway';

const MAX_SEND = 120_000;

export type RedispatchResult =
  | { ok: true; task: unknown }
  | { ok: false; error: string; detail?: unknown; hint?: string };

function buildMessage(taskId: number, agentId: string, task: string, input: string | null): string {
  const header = `[Forge — relance mission · tâche #${taskId} · agent ${agentId}]\n\n`;
  const body = [task, input || ''].filter(Boolean).join('\n\n');
  return `${header}${body}`.slice(0, MAX_SEND);
}

async function sendWithFallbacks(sessionKey: string, message: string) {
  let r = await invokeOpenClawSessionsSend({ sessionKey, message, asyncDelivery: false });
  if (!r.ok) {
    r = await invokeOpenClawSessionsSend({ sessionKey, message, asyncDelivery: true });
  }
  return r;
}

/**
 * Relance une ligne AgentTask vers OpenClaw (sessions_send), avec résolution de clé et double mode sync/async.
 */
export async function runMissionRedispatch(params: {
  taskId: number;
  sessionKey: string;
  email: string | undefined;
}): Promise<RedispatchResult> {
  const { db, AgentTask, eq } = await loadAstroDb();
  const [row] = await db.select().from(AgentTask).where(eq(AgentTask.id, params.taskId)).limit(1);
  if (!row) return { ok: false, error: 'Tâche introuvable' };

  const message = buildMessage(params.taskId, row.agentId, row.task, row.input ?? null);

  let sent = await sendWithFallbacks(params.sessionKey, message);

  if (!sent.ok) {
    const resolved = await resolveSessionsSendKey(params.email, [params.sessionKey, row.agentId]);
    if (resolved && resolved !== params.sessionKey) {
      sent = await sendWithFallbacks(resolved, message);
    }
  }

  if (!sent.ok) {
    return {
      ok: false,
      error: sent.error || 'Envoi impossible',
      detail: sent.detail,
      hint:
        'Si « Envoyer directive » fonctionne sur cette page, la clé session ci-dessus doit être la même. Sinon : gateway.tools.allow, token, OPENCLAW_GATEWAY_URL depuis l’hôte Forge.',
    };
  }

  const now = new Date();
  try {
    await db
      .update(AgentTask)
      .set({ status: 'running', updatedAt: now })
      .where(eq(AgentTask.id, params.taskId));
  } catch {
    /* ignore */
  }

  const [updated] = await db.select().from(AgentTask).where(eq(AgentTask.id, params.taskId)).limit(1);
  return { ok: true, task: updated ?? row };
}
