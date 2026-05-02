import { eq } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { toAgentPath } from './forge-repos';
import { invokeZimaOSSessionsSend, resolveSessionsSendKey } from './zimaos-gateway';

const MAX_SEND = 120_000;

export type RedispatchResult =
  | { ok: true; task: unknown }
  | { ok: false; error: string; detail?: unknown; hint?: string };

async function buildMissionBody(params: {
  taskId: number;
  agentId: string;
  task: string;
  input: string | null;
  projectId: number | null | undefined;
}): Promise<string> {
  const { taskId, agentId, task, input, projectId } = params;
  const header = `[Forge — relance mission · tâche #${taskId} · agent ${agentId}]\n\n`;
  let projectBlock = '';
  if (projectId != null && Number.isFinite(Number(projectId))) {
    const { db, Project } = await loadAstroDb();
    const [p] = await db.select().from(Project).where(eq(Project.id, Number(projectId))).limit(1);
    if (p) {
      const agentPath = await toAgentPath(String(p.path ?? ''));
      projectBlock = [
        '🎯 APPLICATION / DÉPÔT CIBLE',
        `- Nom : ${p.name}`,
        `- Chemin (vue agent) : ${agentPath}`,
        'Concentre cette mission sur ce dépôt / cette application Forge.',
      ].join('\n');
    }
  }
  const body = [task, projectBlock, input || ''].filter(Boolean).join('\n\n');
  return `${header}${body}`.slice(0, MAX_SEND);
}

async function sendWithFallbacks(sessionKey: string, message: string) {
  let r = await invokeZimaOSSessionsSend({ sessionKey, message, asyncDelivery: false });
  if (!r.ok) {
    r = await invokeZimaOSSessionsSend({ sessionKey, message, asyncDelivery: true });
  }
  return r;
}

/**
 * Relance une ligne AgentTask vers ZimaOS (sessions_send), avec résolution de clé et double mode sync/async.
 */
export async function runMissionRedispatch(params: {
  taskId: number;
  sessionKey: string;
  email: string | undefined;
}): Promise<RedispatchResult> {
  const { db, AgentTask, eq } = await loadAstroDb();
  const [row] = await db.select().from(AgentTask).where(eq(AgentTask.id, params.taskId)).limit(1);
  if (!row) return { ok: false, error: 'Tâche introuvable' };

  const message = await buildMissionBody({
    taskId: params.taskId,
    agentId: row.agentId,
    task: row.task,
    input: row.input ?? null,
    projectId: row.projectId as number | null | undefined,
  });

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
        'Si « Envoyer directive » fonctionne sur cette page, la clé session ci-dessus doit être la même. Sinon : gateway.tools.allow, token, ZIMAOS_GATEWAY_URL depuis l’hôte Forge.',
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
