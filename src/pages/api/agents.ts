import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';

type TaskStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
};

function emptyTaskStats(): TaskStats {
  return { total: 0, completed: 0, failed: 0, running: 0, pending: 0 };
}

export const GET: APIRoute = async () => {
  let agents: any[] = [];
  let taskStatsDb: Record<string, TaskStats> = {};
  let dbInstructionRowCount = 0;
  let dbEnabledInstructionCount = 0;

  try {
    const { db, AgentTask, AgentInstruction } = await loadAstroDb();

    const tasks = await db.select().from(AgentTask).orderBy(desc(AgentTask.createdAt)).limit(500);
    for (const t of tasks) {
      const id = t.agentId;
      if (!taskStatsDb[id]) taskStatsDb[id] = emptyTaskStats();
      taskStatsDb[id].total++;
      const s = String(t.status).toLowerCase();
      if (s === 'completed' || s === 'success') taskStatsDb[id].completed++;
      else if (s === 'failed' || s === 'error') taskStatsDb[id].failed++;
      else if (s === 'running') taskStatsDb[id].running++;
      else taskStatsDb[id].pending++;
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
