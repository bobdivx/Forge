/**
 * Synchronise la liste d'agents Forge → openclaw.json du gateway.
 *
 * GET  — aperçu : lit openclaw.json et retourne l'état actuel vs ce que Forge veut pousser.
 * POST — écrit les agents Forge dans agents.list de openclaw.json + redémarre le conteneur.
 */
import type { APIRoute } from 'astro';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { getConfig } from '../../lib/config-db';
import { FORGE_AGENT_INSTRUCTION_ROWS } from '../../lib/agent-instruction-defaults';
import { loadAstroDb } from '../../lib/load-astro-db';
import { fetchOpenClawAgentsList, fetchOpenClawJson } from '../../lib/openclaw-gateway';

const VIRTUAL_AGENTS_CONFIG_KEY = 'openclawVirtualAgents';

async function resolveOpenClawJsonCandidates(): Promise<string[]> {
  const appDataDir = (await getConfig('dockerAppDataDir')).trim() || 'C:\\DATA\\AppData';
  const base = appDataDir.replace(/[\\/]+$/, '');
  const candidates = [
    join(base, 'openclaw', 'openclaw.json'),
    join(base, 'AppData', 'openclaw', 'openclaw.json'),
    'X:/AppData/openclaw/openclaw.json',
    'C:/DATA/AppData/openclaw/openclaw.json',
    '/DATA/AppData/openclaw/openclaw.json',
  ];
  return [...new Set(candidates)];
}

async function resolveOpenClawJsonPath(): Promise<{ path: string; candidates: string[] }> {
  const candidates = await resolveOpenClawJsonCandidates();
  const found = candidates.find((p) => existsSync(p));
  return { path: found || candidates[0], candidates };
}

function readOpenClawJson(path: string): Record<string, unknown> {
  const raw = readFileSync(path, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}

function writeOpenClawJson(path: string, data: Record<string, unknown>): void {
  writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
}

function detectOpenClawContainer(): string | null {
  try {
    // Tente de détecter localement, sinon retourne null pour laisser le body spécifier
    const out = execSync("docker ps --format '{{.Names}}' 2>/dev/null", { timeout: 2000 })
      .toString()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return out.find((n) => n.toLowerCase().includes('openclaw')) ?? null;
  } catch {
    return null;
  }
}

async function getForgeAgentIds(autoEnableIfEmpty = false): Promise<{ ids: string[]; autoEnabled: string[] }> {
  try {
    const { db, AgentInstruction } = await loadAstroDb();
    const rows = await db
      .select({ agentId: AgentInstruction.agentId, enabled: AgentInstruction.enabled })
      .from(AgentInstruction);
    const enabledIds = rows.filter((r) => r.enabled === 1).map((r) => r.agentId);
    if (enabledIds.length > 0 || !autoEnableIfEmpty || rows.length === 0) {
      return { ids: enabledIds, autoEnabled: [] };
    }

    const autoEnabled: string[] = [];
    for (const row of rows) {
      await db
        .update(AgentInstruction)
        .set({ enabled: 1, updatedAt: new Date() })
        .where(eq(AgentInstruction.agentId, row.agentId));
      autoEnabled.push(row.agentId);
    }
    return { ids: autoEnabled, autoEnabled };
  } catch {
    return {
      ids: ['CHEF_TECHNIQUE', 'ARCHITECTE_LOGICIEL', 'DEV_BACKEND', 'DEV_FRONTEND'],
      autoEnabled: [],
    };
  }
}

async function resolveSyncTargetAgentIds(autoEnableIfEmpty = false): Promise<{ ids: string[]; autoEnabled: string[]; adoptedFromGateway: boolean }> {
  const { ids: baseIds, autoEnabled } = await getForgeAgentIds(autoEnableIfEmpty);
  if (baseIds.length > 0) return { ids: [...new Set(baseIds)], autoEnabled, adoptedFromGateway: false };

  const defaults = FORGE_AGENT_INSTRUCTION_ROWS.map((r) => r.agentId);
  const gw = await fetchOpenClawAgentsList(undefined);
  const fromGateway = gw.ok ? gw.agents.map((a) => String(a.id || '').trim()).filter(Boolean) : [];
  const merged = [...new Set([...defaults, ...fromGateway])];
  if (merged.length > 0) {
    return { ids: merged, autoEnabled, adoptedFromGateway: fromGateway.length > 0 };
  }
  return { ids: [], autoEnabled, adoptedFromGateway: false };
}

async function readVirtualAgentsFromForgeConfig(): Promise<string[]> {
  try {
    const { db, Config } = await loadAstroDb();
    const rows = await db.select().from(Config).where(eq(Config.key, VIRTUAL_AGENTS_CONFIG_KEY)).limit(1);
    if (!rows.length) return [];
    const parsed = JSON.parse(String(rows[0].value || '[]'));
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v || '').trim()).filter(Boolean);
  } catch {
    return [];
  }
}

async function writeVirtualAgentsToForgeConfig(agentIds: string[]): Promise<void> {
  const { db, Config } = await loadAstroDb();
  const value = JSON.stringify([...new Set(agentIds)]);
  const existing = await db.select().from(Config).where(eq(Config.key, VIRTUAL_AGENTS_CONFIG_KEY)).limit(1);
  if (existing.length) {
    await db.update(Config).set({ value, updatedAt: new Date() }).where(eq(Config.key, VIRTUAL_AGENTS_CONFIG_KEY));
  } else {
    await db.insert(Config).values({ key: VIRTUAL_AGENTS_CONFIG_KEY, value, updatedAt: new Date() });
  }
}

async function trySyncViaGatewayApi(forgeAgentIds: string[]): Promise<{
  ok: boolean;
  via?: string;
  error?: string;
}> {
  const payloads: { via: string; body: Record<string, unknown> }[] = [
    {
      via: 'agents_sync',
      body: {
        tool: 'agents_sync',
        action: 'json',
        args: { agents: forgeAgentIds.map((id) => ({ id })), merge: true },
      },
    },
    {
      via: 'agents_set',
      body: {
        tool: 'agents_set',
        action: 'json',
        args: { list: forgeAgentIds.map((id) => ({ id })) },
      },
    },
    {
      via: 'agents_upsert',
      body: {
        tool: 'agents_upsert',
        action: 'json',
        args: { agents: forgeAgentIds.map((id) => ({ id })) },
      },
    },
  ];

  let lastError = 'Aucun outil d’écriture des agents exposé par le gateway.';
  for (const attempt of payloads) {
    const res = await fetchOpenClawJson(undefined, '/tools/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attempt.body),
    });
    if (!res.ok) {
      lastError = res.error || `HTTP ${res.status} sur ${attempt.via}`;
      continue;
    }

    const listRes = await fetchOpenClawAgentsList(undefined);
    if (!listRes.ok) {
      lastError = listRes.error || `Écriture ${attempt.via} réussie mais agents_list illisible.`;
      continue;
    }
    const current = new Set(listRes.agents.map((a) => String(a.id || '').trim().toUpperCase()));
    const allPresent = forgeAgentIds.every((id) => current.has(id.toUpperCase()));
    if (allPresent) {
      return { ok: true, via: attempt.via };
    }
    lastError = `Écriture ${attempt.via} acceptée mais agents_list ne reflète pas tous les agents attendus.`;
  }

  return { ok: false, error: lastError };
}

export const GET: APIRoute = async () => {
  try {
    const { path, candidates } = await resolveOpenClawJsonPath();
    const exists = existsSync(path);
    let { ids: forgeAgentIds } = await resolveSyncTargetAgentIds(false);
    const container = detectOpenClawContainer();
    const agentsRes = await fetchOpenClawAgentsList(undefined);
    const gatewayCurrentIds = agentsRes.agents.map((a) => a.id);
    if (forgeAgentIds.length === 0 && gatewayCurrentIds.length > 0) {
      forgeAgentIds = [...new Set(gatewayCurrentIds)];
    }
    const virtualIds = await readVirtualAgentsFromForgeConfig();
    const currentIds = exists
      ? (() => {
          const config = readOpenClawJson(path);
          const agents = (config.agents ?? {}) as Record<string, unknown>;
          const currentList = Array.isArray(agents.list) ? (agents.list as any[]) : [];
          return currentList.map((a) => a.id).filter((id) => typeof id === 'string');
        })()
      : [...new Set([...gatewayCurrentIds, ...virtualIds])];

    if (!exists && !agentsRes.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Config introuvable : ${path}`,
          gatewayError:
            agentsRes.error || `Lecture API impossible (HTTP ${agentsRes.status || 0} sur agents_list).`,
          triedPaths: candidates,
          forgeAgents: forgeAgentIds,
          current: [],
          container,
        }),
        { status: 200 },
      );
    }
    const forgeSet = new Set(forgeAgentIds);
    const currentSet = new Set(currentIds);

    return new Response(JSON.stringify({
      ok: true,
      mode: exists ? 'file+api' : 'api-readonly',
      path: exists ? path : null,
      container,
      gateway: {
        ok: agentsRes.ok,
        status: agentsRes.status,
        error: agentsRes.error,
      },
      current: currentIds,
      forgeAgents: forgeAgentIds,
      toAdd: forgeAgentIds.filter((id) => !currentSet.has(id)),
      notInForge: currentIds.filter((id) => !forgeSet.has(id)),
      upToDate: forgeAgentIds.every((id) => currentSet.has(id)),
      warning: !exists
        ? `Config locale introuvable (${path}) ; aperçu basé sur agents_list (API gateway).`
        : undefined,
      virtualRegistry: !exists ? virtualIds : [],
    }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const { path, candidates } = await resolveOpenClawJsonPath();
    const { db, ActivityLog } = await loadAstroDb();
    const now = new Date();

    const { ids: forgeAgentIds, autoEnabled, adoptedFromGateway } = await resolveSyncTargetAgentIds(true);
    let syncMode: 'api' | 'file' | 'api-virtual' = 'file';
    let syncVia: string | null = null;
    if (!existsSync(path)) {
      const apiSync = await trySyncViaGatewayApi(forgeAgentIds);
      if (!apiSync.ok) {
        // Fallback robuste: registre virtuel côté Forge quand le gateway est en mode lecture seule.
        await writeVirtualAgentsToForgeConfig(forgeAgentIds);
        syncMode = 'api-virtual';
        syncVia = 'forge-shadow-registry';
      } else {
        syncMode = 'api';
        syncVia = apiSync.via || null;
        await writeVirtualAgentsToForgeConfig([]);
      }
    } else {
      const config = readOpenClawJson(path);
      const agents = (config.agents ?? {}) as Record<string, unknown>;
      const existingList = Array.isArray(agents.list) ? (agents.list as any[]) : [];
      const forgeSet = new Set(forgeAgentIds);
      const keepExisting = existingList.filter((a) => !forgeSet.has(a.id));
      const newList = [...forgeAgentIds.map((id) => ({ id })), ...keepExisting];
      config.agents = { ...agents, list: newList };
      writeOpenClawJson(path, config);
      await writeVirtualAgentsToForgeConfig([]);
    }

    // Audit Log
    await db.insert(ActivityLog).values({
      actorType: 'user',
      actorId: 'board',
      action: 'agents.synchronized',
      entityType: 'gateway',
      entityId: 'openclaw',
      details: JSON.stringify({ count: forgeAgentIds.length, agents: forgeAgentIds }),
      createdAt: now,
    });

    const containerName = body.containerName || detectOpenClawContainer();
    let restartResult = null;
    if (containerName) {
      try {
        const out = execSync(`docker restart ${containerName}`, { timeout: 10000 }).toString();
        restartResult = { ok: true, output: out };
      } catch (e: any) {
        restartResult = { ok: false, error: e.message };
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        synchronized: forgeAgentIds.length,
        mode: syncMode,
        via: syncVia,
        note:
          syncMode === 'api-virtual'
            ? `Gateway joignable mais sans outils d'écriture d'agents ; Forge conserve un registre virtuel (${VIRTUAL_AGENTS_CONFIG_KEY}) en attendant l'activation d'un tool de sync côté OpenClaw.`
            : undefined,
        autoEnabled,
        adoptedFromGateway,
        restart: restartResult,
      }),
      { status: 200 },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
};
