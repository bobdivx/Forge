import { eq } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { runForgeOrchestrator } from './forge-orchestrator';
import { insertForgeActivityLog } from './forge-activity-log';

const MAX_AGENT_MESSAGE = 120_000;

export type ForgeAgentRunResult =
  | {
      ok: true;
      reply: string;
      provider: string;
      model: string;
      task?: unknown;
    }
  | { ok: false; error: string; task?: unknown };

function sessionIdForRun(agentId: string, source: string, taskId?: number): string {
  const suffix = taskId != null ? `task-${taskId}` : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `forge-${source}-${agentId}-${suffix}`.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 180);
}

export async function runForgeAgentMessage(params: {
  agentId: string;
  message: string;
  projectId?: number | null;
  taskId?: number;
  actorId?: string;
  source?: 'manual' | 'scheduler' | 'work-directive' | 'redispatch';
  sessionId?: string;
}): Promise<ForgeAgentRunResult> {
  const agentId = String(params.agentId || '').trim();
  const message = String(params.message || '').trim().slice(0, MAX_AGENT_MESSAGE);
  const source = params.source || 'manual';
  if (!agentId) return { ok: false, error: 'agentId requis' };
  if (!message) return { ok: false, error: 'message requis' };

  const { db, AgentTask, ForgeChatSession, ForgeChatMessage } = await loadAstroDb();
  const now = new Date();
  const sessionId = params.sessionId || sessionIdForRun(agentId, source, params.taskId);

  let taskBefore: unknown;
  if (params.taskId != null) {
    const [row] = await db.select().from(AgentTask).where(eq(AgentTask.id, params.taskId)).limit(1);
    taskBefore = row;
    if (!row) return { ok: false, error: 'Tâche introuvable' };
    await db.update(AgentTask).set({ status: 'running', updatedAt: now }).where(eq(AgentTask.id, params.taskId));
  }

  try {
    const existing = await db.select().from(ForgeChatSession).where(eq(ForgeChatSession.id, sessionId)).limit(1);
    if (!existing.length) {
      await db.insert(ForgeChatSession).values({
        id: sessionId,
        agentId,
        projectId: params.projectId ?? undefined,
        title: params.taskId != null ? `AgentTask #${params.taskId}` : `Run ${agentId}`,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    } else {
      await db.update(ForgeChatSession).set({ updatedAt: now }).where(eq(ForgeChatSession.id, sessionId));
    }

    await db.insert(ForgeChatMessage).values({
      sessionId,
      role: 'user',
      content: message,
      meta: JSON.stringify({ source, actor: params.actorId || 'forge' }),
      createdAt: now,
    });

    const orchestrated = await runForgeOrchestrator({
      agentId,
      message,
      projectId: params.projectId ?? undefined,
      sessionId,
    });

    await db.insert(ForgeChatMessage).values({
      sessionId,
      role: 'assistant',
      content: orchestrated.reply,
      provider: orchestrated.provider,
      model: orchestrated.model,
      meta: orchestrated.toolResult ? JSON.stringify({ toolResult: orchestrated.toolResult }) : null,
      createdAt: new Date(),
    });

    let updatedTask: unknown = taskBefore;
    if (params.taskId != null) {
      await db
        .update(AgentTask)
        .set({ status: 'completed', output: orchestrated.reply, updatedAt: new Date() })
        .where(eq(AgentTask.id, params.taskId));
      const [updated] = await db.select().from(AgentTask).where(eq(AgentTask.id, params.taskId)).limit(1);
      updatedTask = updated ?? taskBefore;
    }

    await insertForgeActivityLog({
      actorType: params.actorId ? 'user' : 'system',
      actorId: String(params.actorId || source).slice(0, 200),
      action: params.taskId != null ? 'swarm.task.executed' : 'swarm.agent.executed',
      entityType: params.taskId != null ? 'agent_task' : 'agent',
      entityId: params.taskId != null ? String(params.taskId) : agentId,
      details: { source, sessionId, provider: orchestrated.provider, model: orchestrated.model },
    });

    return {
      ok: true,
      reply: orchestrated.reply,
      provider: orchestrated.provider,
      model: orchestrated.model,
      task: updatedTask,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (params.taskId != null) {
      await db
        .update(AgentTask)
        .set({ status: 'failed', output: error, updatedAt: new Date() })
        .where(eq(AgentTask.id, params.taskId));
      const [updated] = await db.select().from(AgentTask).where(eq(AgentTask.id, params.taskId)).limit(1);
      return { ok: false, error, task: updated ?? taskBefore };
    }
    return { ok: false, error };
  }
}
