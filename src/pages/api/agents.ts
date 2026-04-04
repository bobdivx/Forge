import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import {
  FORGE_AGENT_INSTRUCTION_ROWS,
  FORGE_SWARM_AGENT_COUNT,
  readInstructionMdFromRepo,
} from '../../lib/agent-instruction-defaults';
import { loadAstroDb } from '../../lib/load-astro-db';
import {
  fetchOpenClawSessionsPayload,
  fetchOpenClawAgentsList,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
  getOpenClawClientDebugMeta,
} from '../../lib/openclaw-gateway';

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

/** Compare les agentId DB (casse, underscores) avec les ids affichés (CHEF_TECHNIQUE, clés session…). */
function normAgentKey(s: string): string {
  return String(s).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function resolveStatsFromDb(
  db: Record<string, TaskStats>,
  agentId: string,
  agentName: string,
): TaskStats {
  const pick = (k: string) => {
    const v = db[k];
    if (!v) return null;
    return { ...v };
  };
  for (const k of [agentId, agentName, agentId.toUpperCase(), agentName.toUpperCase()]) {
    const v = pick(k);
    if (v) return v;
  }
  const want = normAgentKey(agentId);
  const wantName = normAgentKey(agentName);
  for (const [k, v] of Object.entries(db)) {
    const nk = normAgentKey(k);
    if (nk && (nk === want || nk === wantName)) return { ...v };
  }
  return emptyTaskStats();
}

/**
 * Tâches persistées + 1 « activité session » par session OpenClaw rattachée à l’agent
 * (sinon graphes et cartes restent à 0 si la table AgentTask est vide).
 */
function buildDisplayTaskStats(
  agents: { id: string; name: string }[],
  rawSessions: Record<string, unknown>[],
  sessionsOk: boolean,
  dbStats: Record<string, TaskStats>,
): Record<string, TaskStats> {
  const out: Record<string, TaskStats> = {};
  const used = new Set<number>();
  for (const a of agents) {
    let s = resolveStatsFromDb(dbStats, a.id, a.name);
    if (sessionsOk && rawSessions.length) {
      const idx = bestSessionIndexForAgent(rawSessions, a.id, used);
      if (idx >= 0) {
        used.add(idx);
        const mapped = mapSessionToAgentRow(rawSessions[idx]);
        s = { ...s };
        s.total += 1;
        if (mapped.status === 'actif') s.running += 1;
        else s.completed += 1;
      }
    }
    out[a.id] = s;
  }
  return out;
}

/** Score de correspondance session OpenClaw ↔ agentId (table AgentInstruction). */
function sessionMatchScore(raw: Record<string, unknown>, agentId: string): number {
  const want = agentId.trim().toUpperCase();
  if (!want) return 0;
  const same = (v: unknown) => String(v ?? '').trim().toUpperCase() === want;
  if (same(raw.agentId) || same(raw.agent_id)) return 100;
  if (same(raw.displayName) || same(raw.display_name)) return 90;
  if (same(raw.label)) return 88;
  const keyStr = String(raw.key ?? raw.sessionKey ?? raw.session_key ?? '');
  if (keyStr) {
    const parts = keyStr
      .split(/[:\\/]+/)
      .map((p) => p.trim().toUpperCase())
      .filter(Boolean);
    if (parts.includes(want)) return 70;
  }
  const mapped = mapSessionToAgentRow(raw);
  if (String(mapped.name).toUpperCase() === want) return 60;
  return 0;
}

function bestSessionIndexForAgent(
  rawSessions: Record<string, unknown>[],
  agentId: string,
  used: Set<number>,
): number {
  let best = -1;
  let bestScore = 0;
  let bestMs = -1;
  rawSessions.forEach((raw, idx) => {
    if (used.has(idx)) return;
    const score = sessionMatchScore(raw, agentId);
    if (score === 0) return;
    const ms = Number(mapSessionToAgentRow(raw).lastSeenMs) || 0;
    if (score > bestScore || (score === bestScore && ms > bestMs)) {
      bestScore = score;
      bestMs = ms;
      best = idx;
    }
  });
  return best;
}

function offlineAgentRow(agentId: string, model: string) {
  return {
    id: agentId,
    name: agentId,
    status: 'en veille',
    model,
    contextTokens: null,
    totalTokens: 0,
    estimatedCostUsd: 0,
    runtimeMs: 0,
    lastSeenMs: 0,
    lastSeen: '—',
    raw: { agentId, offline: true },
  };
}

function disabledAgentRow(agentId: string, model: string) {
  return {
    ...offlineAgentRow(agentId, model),
    status: 'désactivé',
    raw: { agentId, disabledInDb: true },
  };
}

/** Insère les agents du dépôt manquants en base (souvent une seule ligne seed / import partiel). */
async function ensureAllDefaultAgentsInDb(): Promise<void> {
  try {
    const { db, AgentInstruction } = await loadAstroDb();
    const existing = await db.select().from(AgentInstruction);
    const have = new Set(existing.map((r) => r.agentId));
    const missing = FORGE_AGENT_INSTRUCTION_ROWS.filter((row) => !have.has(row.agentId));
    if (!missing.length) return;
    await db.insert(AgentInstruction).values(
      missing.map((a) => ({
        agentId: a.agentId,
        model: a.model,
        filePath: a.filePath,
        systemPrompt: readInstructionMdFromRepo(a.filePath),
        enabled: 1,
        updatedAt: new Date(),
      })),
    );
  } catch {
    /* doublon, concurrence, ou table indisponible */
  }
}

function buildSwarmFromDefaultsAndSessions(
  byAgentId: Map<string, { model?: string | null; enabled?: number | null }>,
  rawSessions: Record<string, unknown>[],
  sessionsOk: boolean,
): { agents: any[]; used: Set<number> } {
  const agents: any[] = [];
  const used = new Set<number>();
  for (const def of FORGE_AGENT_INSTRUCTION_ROWS) {
    const dbRow = byAgentId.get(def.agentId);
    const model = String(dbRow?.model ?? def.model ?? '—');
    const enabled = dbRow == null || Number(dbRow.enabled) === 1;
    if (!enabled) {
      agents.push(disabledAgentRow(def.agentId, model));
      continue;
    }
    const idx = sessionsOk ? bestSessionIndexForAgent(rawSessions, def.agentId, used) : -1;
    if (idx >= 0) {
      used.add(idx);
      const mapped = mapSessionToAgentRow(rawSessions[idx]);
      agents.push({
        ...mapped,
        id: def.agentId,
        name: def.agentId,
        model: mapped.model && mapped.model !== '—' ? mapped.model : model,
      });
    } else {
      agents.push(offlineAgentRow(def.agentId, model));
    }
  }
  return { agents, used };
}

export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email as string | undefined;

  const [result, configMeta, openclawRegistry] = await Promise.all([
    fetchOpenClawSessionsPayload(email),
    getOpenClawClientDebugMeta(),
    fetchOpenClawAgentsList(email),
  ]);

  const rawSessions: Record<string, unknown>[] =
    result.ok ? (normalizeOpenClawSessions(result.data) as Record<string, unknown>[]) : [];

  let agents: any[] = [];
  let mergedWithInstructions = false;
  let dbInstructionRowCount = 0;
  let dbEnabledInstructionCount = 0;

  let taskStatsDb: Record<string, TaskStats> = {};
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

    await ensureAllDefaultAgentsInDb();

    const allInstructions = await db.select().from(AgentInstruction);
    dbInstructionRowCount = allInstructions.length;
    dbEnabledInstructionCount = allInstructions.filter((r) => Number(r.enabled) === 1).length;

    const byAgentId = new Map(
      allInstructions.map((r) => [r.agentId, { model: r.model, enabled: r.enabled }]),
    );

    mergedWithInstructions = true;
    const { agents: built, used } = buildSwarmFromDefaultsAndSessions(
      byAgentId,
      rawSessions,
      result.ok,
    );
    agents = built;
    if (result.ok) {
      rawSessions.forEach((raw, i) => {
        if (used.has(i)) return;
        agents.push(mapSessionToAgentRow(raw));
      });
    }
  } catch {
    /* DB indisponible : liste canonique dépôt + sessions uniquement */
    const emptyMap = new Map<string, { model?: string | null; enabled?: number | null }>();
    const { agents: built, used } = buildSwarmFromDefaultsAndSessions(emptyMap, rawSessions, result.ok);
    agents = built;
    if (result.ok) {
      rawSessions.forEach((raw, i) => {
        if (used.has(i)) return;
        agents.push(mapSessionToAgentRow(raw));
      });
    }
  }

  const registryIds = openclawRegistry.agents.map((a) => a.id);
  const registryMatchForgeDefault =
    openclawRegistry.ok && registryIds.length === FORGE_SWARM_AGENT_COUNT;

  const taskStats = buildDisplayTaskStats(
    agents.map((a) => ({ id: String(a.id), name: String(a.name) })),
    rawSessions,
    result.ok,
    taskStatsDb,
  );

  return new Response(
    JSON.stringify({
      agents,
      taskStats,
      forgeDefaultSwarmCount: FORGE_SWARM_AGENT_COUNT,
      swarmDisplayedCount: FORGE_AGENT_INSTRUCTION_ROWS.length,
      dbInstructionRowCount,
      dbEnabledInstructionCount,
      swarmInstructionCount: dbEnabledInstructionCount,
      openclawAgentsRegistry: {
        ok: openclawRegistry.ok,
        status: openclawRegistry.status,
        count: openclawRegistry.agents.length,
        agentIds: registryIds,
        agents: openclawRegistry.agents,
        requester: openclawRegistry.requester,
        allowAny: openclawRegistry.allowAny,
        error: openclawRegistry.error,
        matchesForgeDefaultRowCount: registryMatchForgeDefault,
      },
      gatewayError: result.ok ? undefined : result.error,
      gatewayVia: result.via,
      openclawDebug: {
        viewerEmail: email ?? null,
        ...configMeta,
        httpStatus: result.status,
        resolvedVia: result.via ?? null,
        gatewaySessionCount: rawSessions.length,
        listedAgentCount: agents.length,
        mergedWithInstructions,
        forgeDefaultSwarmCount: FORGE_SWARM_AGENT_COUNT,
        swarmDisplayedCount: FORGE_AGENT_INSTRUCTION_ROWS.length,
        dbInstructionRowCount,
        dbEnabledInstructionCount,
        openclawAgentsListCount: openclawRegistry.agents.length,
        openclawAgentsListMatchesDefault15: registryMatchForgeDefault,
        attempts: result.attempts,
        taskStatsMergedWithSessions: true,
        dbTaskAgentKeyCount: Object.keys(taskStatsDb).length,
        note:
          'taskStats = tâches Astro DB (agentId normalisé) + 1 activité par session OpenClaw rattachée (actif → running, sinon completed). Table AgentTask vide ⇒ les graphes utilisaient 0 avant cette fusion.',
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
