/**
 * Mise à jour AgentTask + carnet Request lié ([ForgeRequest #…] dans le titre).
 */

import { eq } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { extractForgeRequestIdFromTaskBlob } from './forge-request-routing';
import { insertForgeActivityLog } from './forge-activity-log';

export type AgentTaskTerminalStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'bug'
  | 'cancelled';

/**
 * Met à jour une AgentTask puis le statut Request si la tâche lie une demande carnet.
 */
export async function finalizeAgentTaskStatus(
  taskId: number,
  status: AgentTaskTerminalStatus,
  output?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const { db, AgentTask, Request } = await loadAstroDb();
    const rows = await db.select().from(AgentTask).where(eq(AgentTask.id, taskId)).limit(1);
    const row = rows[0];
    if (!row) return { ok: false, error: 'Tâche introuvable' };

    await db
      .update(AgentTask)
      .set({
        status: String(status),
        ...(output !== undefined
          ? { output: output != null ? String(output).slice(0, 12_000) : undefined }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(AgentTask.id, taskId));

    const blob = `${row.task ?? ''}\n${row.input ?? ''}`;
    const forgeReqId = extractForgeRequestIdFromTaskBlob(blob);
    if (forgeReqId != null) {
      const st = String(status);
      let requestStatus: string | null = null;
      if (st === 'completed') requestStatus = 'completed';
      else if (st === 'failed') requestStatus = 'pending';
      else if (st === 'cancelled') requestStatus = 'rejected';
      else if (st === 'running') requestStatus = 'in_progress';
      else if (st === 'pending') requestStatus = 'pending';
      if (requestStatus) {
        await db
          .update(Request)
          .set({ status: requestStatus, updatedAt: new Date() })
          .where(eq(Request.id, forgeReqId));
        await insertForgeActivityLog({
          actorType: 'system',
          actorId: 'forge_task_sync',
          action: 'carnet.request.synced_from_task',
          entityType: 'request',
          entityId: String(forgeReqId),
          details: {
            taskId,
            taskStatus: st,
            requestStatus,
            agentId: String(row.agentId || ''),
          },
        });
      }
    }

    return { ok: true };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Clôture automatique depuis ZimaOS : uniquement si la tâche est encore « running ».
 */
export async function tryAutoCompleteTaskFromSignal(
  taskId: number,
  signal: 'completed' | 'failed',
  outputHint = '[Forge — détection automatique FORGE_DONE]',
): Promise<boolean> {
  try {
    const { db, AgentTask, eq } = await loadAstroDb();
    const rows = await db.select().from(AgentTask).where(eq(AgentTask.id, taskId)).limit(1);
    const row = rows[0];
    if (!row || String(row.status).toLowerCase() !== 'running') return false;

    const r = await finalizeAgentTaskStatus(taskId, signal, outputHint);
    if (r.ok) {
      await insertForgeActivityLog({
        actorType: 'system',
        actorId: 'zimaos_scan',
        action: 'swarm.task.completed_via_zimaos_scan',
        entityType: 'agent_task',
        entityId: String(taskId),
        details: { signal, agentId: String(row.agentId || '') },
      });
    }
    return r.ok;
  } catch {
    return false;
  }
}
