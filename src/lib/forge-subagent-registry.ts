/**
 * Registre durable des sous-agents Forge.
 *
 * Pattern emprunté à `subagent-registry.ts` d'openclaw :
 *  - chaque spawn de sous-agent crée une ligne `SubagentRun` (status `pending`)
 *  - le scheduler / l'orchestrateur transitionne `pending → running → completed / failed / cancelled`
 *  - l'UI peut requêter le registre pour afficher l'arbre des runs
 *
 * Le module est volontairement minimal : il n'orchestre rien lui-même, il
 * fournit une API CRUD typée et un audit log automatique.
 */
import { eq, desc, and } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { insertForgeActivityLog } from './forge-activity-log';

export type SubagentRunStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type SubagentRunRecord = {
  id: number;
  parentAgentId: string;
  childAgentId: string;
  projectId: number | null;
  status: SubagentRunStatus;
  taskId: number | null;
  reason: string | null;
  output: string | null;
  error: string | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
};

function asStatus(raw: unknown): SubagentRunStatus {
  const s = String(raw || '').toLowerCase();
  if (s === 'pending' || s === 'running' || s === 'completed' || s === 'failed' || s === 'cancelled') {
    return s;
  }
  return 'pending';
}

function normalizeDate(v: unknown): Date | null {
  if (!v) return null;
  if (v instanceof Date) return v;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapRow(row: Record<string, unknown>): SubagentRunRecord {
  return {
    id: Number(row.id),
    parentAgentId: String(row.parentAgentId),
    childAgentId: String(row.childAgentId),
    projectId: row.projectId == null ? null : Number(row.projectId),
    status: asStatus(row.status),
    taskId: row.taskId == null ? null : Number(row.taskId),
    reason: row.reason == null ? null : String(row.reason),
    output: row.output == null ? null : String(row.output),
    error: row.error == null ? null : String(row.error),
    startedAt: normalizeDate(row.startedAt),
    finishedAt: normalizeDate(row.finishedAt),
    createdAt: normalizeDate(row.createdAt) ?? new Date(),
  };
}

export async function startSubagentRun(params: {
  parentAgentId: string;
  childAgentId: string;
  projectId?: number | null;
  taskId?: number | null;
  reason?: string;
}): Promise<SubagentRunRecord | null> {
  const { db, SubagentRun } = await loadAstroDb();
  if (!SubagentRun) return null;
  const now = new Date();
  const inserted = await db
    .insert(SubagentRun)
    .values({
      parentAgentId: params.parentAgentId,
      childAgentId: params.childAgentId,
      projectId: params.projectId ?? null,
      taskId: params.taskId ?? null,
      status: 'pending',
      reason: params.reason ? params.reason.slice(0, 500) : null,
      createdAt: now,
    })
    .returning();
  const row = inserted[0];
  if (row) {
    await insertForgeActivityLog({
      actorType: 'agent',
      actorId: params.parentAgentId,
      action: 'subagent.run.started',
      entityType: 'subagent_run',
      entityId: String(row.id),
      details: {
        child: params.childAgentId,
        projectId: params.projectId ?? null,
        reason: params.reason?.slice(0, 200) ?? '',
      },
    });
    return mapRow(row as Record<string, unknown>);
  }
  return null;
}

export async function markSubagentRunning(runId: number): Promise<void> {
  const { db, SubagentRun } = await loadAstroDb();
  if (!SubagentRun) return;
  await db
    .update(SubagentRun)
    .set({ status: 'running', startedAt: new Date() })
    .where(eq(SubagentRun.id, runId));
}

export async function completeSubagentRun(runId: number, output?: string): Promise<void> {
  const { db, SubagentRun } = await loadAstroDb();
  if (!SubagentRun) return;
  const now = new Date();
  await db
    .update(SubagentRun)
    .set({
      status: 'completed',
      finishedAt: now,
      output: output ? output.slice(0, 32_000) : null,
    })
    .where(eq(SubagentRun.id, runId));
  await insertForgeActivityLog({
    actorType: 'system',
    actorId: 'subagent_registry',
    action: 'subagent.run.completed',
    entityType: 'subagent_run',
    entityId: String(runId),
    details: { hasOutput: Boolean(output) },
  });
}

export async function failSubagentRun(runId: number, error: string): Promise<void> {
  const { db, SubagentRun } = await loadAstroDb();
  if (!SubagentRun) return;
  await db
    .update(SubagentRun)
    .set({ status: 'failed', finishedAt: new Date(), error: String(error).slice(0, 4_000) })
    .where(eq(SubagentRun.id, runId));
  await insertForgeActivityLog({
    actorType: 'system',
    actorId: 'subagent_registry',
    action: 'subagent.run.failed',
    entityType: 'subagent_run',
    entityId: String(runId),
    details: { error: String(error).slice(0, 200) },
  });
}

export async function cancelSubagentRun(runId: number, reason?: string): Promise<void> {
  const { db, SubagentRun } = await loadAstroDb();
  if (!SubagentRun) return;
  await db
    .update(SubagentRun)
    .set({ status: 'cancelled', finishedAt: new Date(), error: reason ? String(reason).slice(0, 4_000) : null })
    .where(eq(SubagentRun.id, runId));
  await insertForgeActivityLog({
    actorType: 'system',
    actorId: 'subagent_registry',
    action: 'subagent.run.cancelled',
    entityType: 'subagent_run',
    entityId: String(runId),
    details: { reason: reason?.slice(0, 200) ?? null },
  });
}

export async function getSubagentRun(runId: number): Promise<SubagentRunRecord | null> {
  const { db, SubagentRun } = await loadAstroDb();
  if (!SubagentRun) return null;
  const rows = await db.select().from(SubagentRun).where(eq(SubagentRun.id, runId));
  return rows[0] ? mapRow(rows[0] as Record<string, unknown>) : null;
}

export async function listSubagentRuns(filter?: {
  parentAgentId?: string;
  childAgentId?: string;
  status?: SubagentRunStatus;
  limit?: number;
}): Promise<SubagentRunRecord[]> {
  const { db, SubagentRun } = await loadAstroDb();
  if (!SubagentRun) return [];
  const conditions: unknown[] = [];
  if (filter?.parentAgentId) conditions.push(eq(SubagentRun.parentAgentId, filter.parentAgentId));
  if (filter?.childAgentId) conditions.push(eq(SubagentRun.childAgentId, filter.childAgentId));
  if (filter?.status) conditions.push(eq(SubagentRun.status, filter.status));
  let query: any = db.select().from(SubagentRun);
  if (conditions.length === 1) {
    query = query.where(conditions[0] as never);
  } else if (conditions.length > 1) {
    query = query.where(and(...(conditions as never[])) as never);
  }
  const rows = await query.orderBy(desc(SubagentRun.id)).limit(filter?.limit ?? 50);
  return rows.map((r: any) => mapRow(r as Record<string, unknown>));
}

/**
 * Compte simple : combien de runs sont actuellement actifs (pending ou running) ?
 * Utilisé par le scheduler pour limiter la concurrence.
 */
export async function countActiveSubagentRuns(parentAgentId?: string): Promise<number> {
  const rows = await listSubagentRuns({ parentAgentId, limit: 200 });
  return rows.filter((r) => r.status === 'pending' || r.status === 'running').length;
}
