import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import { FORGE_PROJECT_CHILD_TOKEN } from '../../lib/forge-project-scoped-agents';

type TaskStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
};

/** Tâche `running` affichée sur la carte agent (parent agrège les sous-agents projet). */
export type AgentCurrentWork = {
  taskId: number;
  title: string;
  /** Identifiant réel de la tâche si déléguée à un sous-agent `…__APP_…` */
  delegatedAgentId?: string;
};

function emptyTaskStats(): TaskStats {
  return { total: 0, completed: 0, failed: 0, running: 0, pending: 0 };
}

/** Remonte un agent enfant `PARENT__APP_TOKEN` vers l’agent parent Forge. */
function rollupParentAgentId(agentId: string): string {
  const s = String(agentId || '');
  const i = s.indexOf(FORGE_PROJECT_CHILD_TOKEN);
  if (i === -1) return s;
  return s.slice(0, i).replace(/_+$/, '') || s;
}

function taskUpdatedMs(t: { updatedAt?: unknown }): number {
  const u = t.updatedAt;
  return u instanceof Date ? u.getTime() : new Date(String(u || 0)).getTime();
}

export const GET: APIRoute = async () => {
  let agents: any[] = [];
  let taskStatsDb: Record<string, TaskStats> = {};
  let dbInstructionRowCount = 0;
  let dbEnabledInstructionCount = 0;

  try {
    const { db, AgentTask, AgentInstruction } = await loadAstroDb();

    const tasks = await db.select().from(AgentTask).orderBy(desc(AgentTask.createdAt)).limit(800);

    const creditStats = (agentKey: string, statusRaw: string) => {
      if (!taskStatsDb[agentKey]) taskStatsDb[agentKey] = emptyTaskStats();
      taskStatsDb[agentKey].total++;
      const s = String(statusRaw).toLowerCase();
      if (s === 'completed' || s === 'success') taskStatsDb[agentKey].completed++;
      else if (s === 'failed' || s === 'error') taskStatsDb[agentKey].failed++;
      else if (s === 'running') taskStatsDb[agentKey].running++;
      else taskStatsDb[agentKey].pending++;
    };

    for (const t of tasks) {
      const scoped = String(t.agentId || '');
      const targets = new Set<string>();
      targets.add(scoped);
      const parent = rollupParentAgentId(scoped);
      if (parent !== scoped) targets.add(parent);

      for (const key of targets) {
        creditStats(key, String(t.status || ''));
      }
    }

    /** Dernière tâche `running` par agent affiché (même logique d’agrégation). */
    const runningPreview = new Map<
      string,
      { taskId: number; title: string; delegatedAgentId?: string; ts: number }
    >();

    for (const t of tasks) {
      if (String(t.status || '').toLowerCase() !== 'running') continue;
      const scoped = String(t.agentId || '');
      const title = String(t.task || '').trim().slice(0, 240) || '(sans titre)';
      const ts = taskUpdatedMs(t);
      const parent = rollupParentAgentId(scoped);

      const push = (agentKey: string, delegatedAgentId?: string) => {
        const prev = runningPreview.get(agentKey);
        if (!prev || ts > prev.ts) {
          runningPreview.set(agentKey, {
            taskId: Number(t.id),
            title,
            delegatedAgentId,
            ts,
          });
        }
      };

      push(scoped, undefined);
      if (parent !== scoped) {
        push(parent, scoped);
      }
    }

    const allInstructions = await db.select().from(AgentInstruction);
    dbInstructionRowCount = allInstructions.length;
    dbEnabledInstructionCount = allInstructions.filter((r) => Number(r.enabled) === 1).length;

    for (const inst of allInstructions) {
      const id = inst.agentId;
      const model = String(inst.model || '—');
      const enabled = Number(inst.enabled) === 1;

      const stats = taskStatsDb[id] || emptyTaskStats();
      const isActive = stats.running > 0;

      const rp = runningPreview.get(id);
      const currentWork: AgentCurrentWork | null = rp
        ? {
            taskId: rp.taskId,
            title: rp.title,
            ...(rp.delegatedAgentId ? { delegatedAgentId: rp.delegatedAgentId } : {}),
          }
        : null;

      agents.push({
        id,
        name: id,
        status: enabled ? (isActive ? 'actif' : 'en veille') : 'désactivé',
        model,
        contextTokens: null,
        totalTokens: 0,
        estimatedCostUsd: 0,
        runtimeMs: 0,
        lastSeenMs: 0,
        lastSeen: '—',
        currentWork,
        raw: { source: 'database', enabledInForge: enabled },
      });
    }

    agents.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(
    JSON.stringify({
      agents,
      taskStats: taskStatsDb,
      forgeDefaultSwarmCount: agents.length,
      swarmDisplayedCount: agents.length,
      dbInstructionRowCount,
      dbEnabledInstructionCount,
      swarmInstructionCount: dbEnabledInstructionCount,
      activationAdvice: { message: undefined },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
