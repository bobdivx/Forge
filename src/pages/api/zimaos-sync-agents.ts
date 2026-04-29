/**
 * Synchronise la liste d'agents Forge → zimaos.json du gateway.
 *
 * GET  — aperçu : lit zimaos.json et retourne l'état actuel vs ce que Forge veut pousser.
 * POST — écrit les agents Forge dans agents.list de zimaos.json + redémarre le conteneur.
 */
import type { APIRoute } from 'astro';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { getConfig } from '../../lib/config-db';
import { FORGE_AGENT_INSTRUCTION_ROWS } from '../../lib/agent-instruction-defaults';
import { loadAstroDb } from '../../lib/load-astro-db';
import { fetchZimaOSAgentsList, fetchZimaOSJson } from '../../lib/zimaos-gateway';

const VIRTUAL_AGENTS_CONFIG_KEY = 'zimaosVirtualAgents';
const RESERVED_AGENT_IDS = new Set(['MAIN']);
const AGENT_ID_RE = /^[A-Z0-9_]{2,72}$/;
const SUBAGENT_MARKER = '__APP_';

type ZimaOSAgentEntry = { id: string; model?: string };
type SubagentPolicyReport = {
  ok: boolean;
  issues: string[];
  maxSpawnDepth?: number;
  repaired?: boolean;
};

function normalizeAgentId(input: unknown): string {
  const raw = String(input ?? '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase().replace(/[^A-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!upper) return '';
  if (RESERVED_AGENT_IDS.has(upper)) return '';
  return AGENT_ID_RE.test(upper) ? upper : '';
}

function normalizeAgentIds(ids: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const n = normalizeAgentId(id);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function isProjectScopedSubagent(id: string): boolean {
  return id.includes(SUBAGENT_MARKER);
}

function parseZimaOSAgentsList(config: Record<string, unknown>): ZimaOSAgentEntry[] {
  const agents = (config.agents ?? {}) as Record<string, unknown>;
  const list = Array.isArray(agents.list) ? (agents.list as unknown[]) : [];
  const out: ZimaOSAgentEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const o = item as Record<string, unknown>;
    const id = normalizeAgentId(o.id);
    if (!id) continue;
    const model = typeof o.model === 'string' && o.model.trim() ? o.model.trim() : undefined;
    out.push({ id, model });
  }
  return out;
}

function sanitizeAgentsListForSync(
  existingEntries: ZimaOSAgentEntry[],
  forgeAgentIds: string[],
  forgeModelsMap: Map<string, string>,
): ZimaOSAgentEntry[] {
  const byId = new Map(existingEntries.map((e) => [e.id, e]));
  const forgeSet = new Set(forgeAgentIds);
  const next: ZimaOSAgentEntry[] = [];

  // Base canonique Forge (ajout/retrait piloté par Forge)
  for (const id of forgeAgentIds) {
    const model = forgeModelsMap.get(id);
    next.push(model ? { id, model } : { id });
  }

  // Conserver seulement les sous-agents applicatifs valides déjà présents.
  for (const item of existingEntries) {
    if (forgeSet.has(item.id)) continue;
    if (!isProjectScopedSubagent(item.id)) continue;
    next.push(item.model ? { id: item.id, model: item.model } : { id: item.id });
  }

  return next;
}

function isLikelyHealthyZimaOSConfig(parsed: Record<string, unknown>): boolean {
  const hasGateway = parsed.gateway && typeof parsed.gateway === 'object';
  const hasModels = parsed.models && typeof parsed.models === 'object';
  const agents = parsed.agents && typeof parsed.agents === 'object' ? (parsed.agents as Record<string, unknown>) : null;
  const hasAgentsList = agents && Array.isArray(agents.list);
  return Boolean(hasGateway && hasModels && hasAgentsList);
}

async function resolveZimaOSJsonCandidates(): Promise<string[]> {
  const appDataDir = (await getConfig('dockerAppDataDir')).trim() || 'C:\\DATA\\AppData';
  const base = appDataDir.replace(/[\\/]+$/, '');
  const candidates = [
    join(base, 'zimaos', 'zimaos.json'),
    join(base, 'AppData', 'zimaos', 'zimaos.json'),
    'X:/AppData/zimaos/zimaos.json',
    'X:/AppData/zimaos/config/zimaos.json',
    'C:/DATA/AppData/zimaos/zimaos.json',
    '/DATA/AppData/zimaos/zimaos.json',
  ];
  return [...new Set(candidates)];
}

async function resolveZimaOSJsonPath(infra: any): Promise<{ path: string; candidates: string[] }> {
  const candidates = await resolveZimaOSJsonCandidates();
  let found: string | undefined;
  for (const p of candidates) {
    if (infra.exists(p)) {
      found = p;
      break;
    }
  }
  return { path: found || candidates[0], candidates };
}

function readZimaOSJson(infra: any, path: string): Record<string, unknown> {
  const raw = infra.readFile(path);
  return JSON.parse(raw) as Record<string, unknown>;
}

function writeZimaOSJson(infra: any, path: string, data: Record<string, unknown>): void {
  infra.writeFile(path, JSON.stringify(data, null, 2));
}

function diagnoseSubagentPolicy(config: Record<string, unknown>): SubagentPolicyReport {
  const issues: string[] = [];
  const agents = (config.agents ?? {}) as Record<string, unknown>;
  const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
  const defaultsSubagents = (defaults.subagents ?? {}) as Record<string, unknown>;
  const maxSpawnDepthRaw = Number(defaultsSubagents.maxSpawnDepth ?? 1);
  const maxSpawnDepth = Number.isFinite(maxSpawnDepthRaw) ? maxSpawnDepthRaw : 1;
  if (maxSpawnDepth < 2) {
    issues.push(`agents.defaults.subagents.maxSpawnDepth=${String(defaultsSubagents.maxSpawnDepth ?? '(absent)')} (<2).`);
  }

  const list = Array.isArray(agents.list) ? (agents.list as unknown[]) : [];
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const entry = item as Record<string, unknown>;
    const id = normalizeAgentId(entry.id);
    if (!id) continue;
    const subagents = (entry.subagents ?? {}) as Record<string, unknown>;
    const allowAgents = Array.isArray(subagents.allowAgents)
      ? subagents.allowAgents.map((v) => String(v || '').trim()).filter(Boolean)
      : [];
    const allowAny = allowAgents.some((v) => v === '*');
    if (!allowAny) {
      issues.push(`${id}: subagents.allowAgents absent/incomplet.`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    maxSpawnDepth,
  };
}

function enforceSubagentPolicy(config: Record<string, unknown>): {
  changed: boolean;
  report: SubagentPolicyReport;
  nextConfig: Record<string, unknown>;
} {
  const agents = (config.agents ?? {}) as Record<string, unknown>;
  const defaults = (agents.defaults ?? {}) as Record<string, unknown>;
  const defaultsSubagents = (defaults.subagents ?? {}) as Record<string, unknown>;
  let changed = false;

  const currentDepth = Number(defaultsSubagents.maxSpawnDepth ?? 1);
  if (!Number.isFinite(currentDepth) || currentDepth < 2) {
    defaultsSubagents.maxSpawnDepth = 2;
    changed = true;
  }

  const listRaw = Array.isArray(agents.list) ? (agents.list as unknown[]) : [];
  const list = listRaw.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    const entry = item as Record<string, unknown>;
    const id = normalizeAgentId(entry.id);
    if (!id) return entry;

    const subagents = (entry.subagents ?? {}) as Record<string, unknown>;
    const allowAgents = Array.isArray(subagents.allowAgents)
      ? subagents.allowAgents.map((v) => String(v || '').trim()).filter(Boolean)
      : [];
    const allowAny = allowAgents.some((v) => v === '*');
    if (!allowAny) {
      changed = true;
      return {
        ...entry,
        subagents: {
          ...subagents,
          allowAgents: ['*'],
        },
      };
    }
    return entry;
  });

  const nextConfig = {
    ...config,
    agents: {
      ...agents,
      defaults: {
        ...defaults,
        subagents: defaultsSubagents,
      },
      list,
    },
  } as Record<string, unknown>;
  const report = diagnoseSubagentPolicy(nextConfig);
  return { changed, report: { ...report, repaired: changed && report.ok }, nextConfig };
}

function detectZimaOSContainer(infra: any): string | null {
  try {
    const out = infra.exec("docker ps --format '{{.Names}}'")
      .split('\n')
      .map((s: string) => s.trim())
      .filter(Boolean);
    return out.find((n: string) => n.toLowerCase().includes('zimaos')) ?? null;
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
    const enabledIds = normalizeAgentIds(rows.filter((r) => r.enabled === 1).map((r) => r.agentId));
    if (enabledIds.length > 0 || !autoEnableIfEmpty || rows.length === 0) {
      return { ids: enabledIds, autoEnabled: [] };
    }

    const autoEnabled: string[] = [];
    for (const row of rows) {
      await db
        .update(AgentInstruction)
        .set({ enabled: 1, updatedAt: new Date() })
        .where(eq(AgentInstruction.agentId, row.agentId));
      const normalized = normalizeAgentId(row.agentId);
      if (normalized) autoEnabled.push(normalized);
    }
    const cleaned = normalizeAgentIds(autoEnabled);
    return { ids: cleaned, autoEnabled: cleaned };
  } catch {
    return {
      ids: normalizeAgentIds(['CHEF_TECHNIQUE', 'ARCHITECTE_LOGICIEL', 'DEV_BACKEND', 'DEV_FRONTEND']),
      autoEnabled: [],
    };
  }
}

async function resolveSyncTargetAgentIds(autoEnableIfEmpty = false): Promise<{ ids: string[]; autoEnabled: string[]; adoptedFromGateway: boolean }> {
  const { ids: baseIds, autoEnabled } = await getForgeAgentIds(autoEnableIfEmpty);
  if (baseIds.length > 0) return { ids: normalizeAgentIds(baseIds), autoEnabled, adoptedFromGateway: false };

  const defaults = normalizeAgentIds(FORGE_AGENT_INSTRUCTION_ROWS.map((r) => r.agentId));
  const gw = await fetchZimaOSAgentsList(undefined);
  const fromGateway = gw.ok ? normalizeAgentIds(gw.agents.map((a) => String(a.id || '').trim())) : [];
  const merged = normalizeAgentIds([...defaults, ...fromGateway]);
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
    return normalizeAgentIds(parsed.map((v) => String(v || '').trim()));
  } catch {
    return [];
  }
}

async function writeVirtualAgentsToForgeConfig(agentIds: string[]): Promise<void> {
  const { db, Config } = await loadAstroDb();
  const value = JSON.stringify(normalizeAgentIds(agentIds));
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
  const { db, AgentInstruction } = await loadAstroDb();
  const rows = await db.select().from(AgentInstruction);
  const instructionsMap = new Map(rows.map(r => [r.agentId, r]));

  const payloads: { via: string; body: Record<string, unknown> }[] = [
    {
      via: 'agents_upsert',
      body: {
        tool: 'agents_upsert',
        action: 'json',
        args: { 
          agents: forgeAgentIds.map((id) => {
            const instr = instructionsMap.get(id);
            return { 
              id, 
              name: id,
              model: instr?.model || 'qwen2.5:7b',
              systemPrompt: instr?.systemPrompt || '',
              provider: 'ollama' 
            };
          }) 
        },
      },
    },
    {
      via: 'agents_sync',
      body: {
        tool: 'agents_sync',
        action: 'json',
        args: { agents: forgeAgentIds.map((id) => ({ id })), merge: true },
      },
    },
  ];

  let lastError = 'Aucun outil d’écriture des agents exposé par le gateway.';
  for (const attempt of payloads) {
    const res = await fetchZimaOSJson(undefined, '/tools/invoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(attempt.body),
    });
    if (!res.ok) {
      lastError = res.error || `HTTP ${res.status} sur ${attempt.via}`;
      continue;
    }

    const listRes = await fetchZimaOSAgentsList(undefined);
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
    const { getZimaOSInfraClient } = await import('../../lib/zimaos-infra-client');
    const infra = await getZimaOSInfraClient();
    const { path, candidates } = await resolveZimaOSJsonPath(infra);
    const exists = infra.exists(path);
    let { ids: forgeAgentIds } = await resolveSyncTargetAgentIds(false);
    const container = detectZimaOSContainer(infra);
    const agentsRes = await fetchZimaOSAgentsList(undefined);
    const gatewayCurrentIds = normalizeAgentIds(agentsRes.agents.map((a) => a.id));
    if (forgeAgentIds.length === 0 && gatewayCurrentIds.length > 0) {
      forgeAgentIds = [...new Set(gatewayCurrentIds)];
    }
    const virtualIds = await readVirtualAgentsFromForgeConfig();
    const currentIds = exists
      ? (() => {
          const config = readZimaOSJson(infra, path);
          const currentEntries = parseZimaOSAgentsList(config);
          return currentEntries.map((a) => a.id);
        })()
      : [...new Set([...gatewayCurrentIds, ...virtualIds])];
    const subagentPolicy = exists
      ? diagnoseSubagentPolicy(readZimaOSJson(infra, path))
      : ({ ok: false, issues: ['zimaos.json introuvable: politique subagents non vérifiable.'] } as SubagentPolicyReport);

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
    const forgeSet = new Set(normalizeAgentIds(forgeAgentIds));
    const currentSet = new Set(normalizeAgentIds(currentIds));

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
      current: normalizeAgentIds(currentIds),
      forgeAgents: normalizeAgentIds(forgeAgentIds),
      toAdd: normalizeAgentIds(forgeAgentIds).filter((id) => !currentSet.has(id)),
      notInForge: normalizeAgentIds(currentIds).filter((id) => !forgeSet.has(id)),
      upToDate: normalizeAgentIds(forgeAgentIds).every((id) => currentSet.has(id)),
      warning: !exists
        ? `Config locale introuvable (${path}) ; aperçu basé sur agents_list (API gateway).`
        : undefined,
      virtualRegistry: !exists ? virtualIds : [],
      subagentPolicy,
    }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
};

export async function performZimaOSAgentsSync(containerNameOverride?: string): Promise<{
  ok: true;
  synchronized: number;
  mode: 'api' | 'file' | 'api-virtual';
  via: string | null;
  note?: string;
  autoEnabled: string[];
  adoptedFromGateway: boolean;
  restart: unknown;
}> {
    const { getZimaOSInfraClient } = await import('../../lib/zimaos-infra-client');
    const infra = await getZimaOSInfraClient();
    const { path, candidates } = await resolveZimaOSJsonPath(infra);
    const { db, ActivityLog } = await loadAstroDb();
    const now = new Date();

    const { ids: forgeAgentIds, autoEnabled, adoptedFromGateway } = await resolveSyncTargetAgentIds(true);
    let syncMode: 'api' | 'file' | 'api-virtual' = 'file';
    let syncVia: string | null = null;
    if (!infra.exists(path)) {
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
      const beforeRaw = infra.readFile(path);
      const rows = await db.select().from(AgentInstruction);
      const forgeModelsMap = new Map(rows.map(r => [r.agentId, r.model || '']));
      
      const config = JSON.parse(beforeRaw) as Record<string, unknown>;
      const agents = (config.agents ?? {}) as Record<string, unknown>;
      const existingEntries = parseZimaOSAgentsList(config);
      const newList = sanitizeAgentsListForSync(existingEntries, normalizeAgentIds(forgeAgentIds), forgeModelsMap);
      const syncedConfig = { ...config, agents: { ...agents, list: newList } } as Record<string, unknown>;
      const repairedPolicy = enforceSubagentPolicy(syncedConfig);
      if (!isLikelyHealthyZimaOSConfig(repairedPolicy.nextConfig)) {
        throw new Error('Sync refusée: structure zimaos.json invalide après merge (gateway/models/agents.list requis).');
      }
      writeZimaOSJson(infra, path, repairedPolicy.nextConfig);
      try {
        const reloaded = readZimaOSJson(infra, path);
        if (!isLikelyHealthyZimaOSConfig(reloaded)) {
          infra.writeFile(path, beforeRaw);
          throw new Error('Sync annulée: vérification post-écriture invalide, rollback effectué.');
        }
      } catch (e) {
        infra.writeFile(path, beforeRaw);
        throw e;
      }
      await writeVirtualAgentsToForgeConfig([]);
    }

    // Audit Log
    await db.insert(ActivityLog).values({
      actorType: 'user',
      actorId: 'board',
      action: 'agents.synchronized',
      entityType: 'gateway',
      entityId: 'zimaos',
      details: JSON.stringify({ count: forgeAgentIds.length, agents: forgeAgentIds }),
      createdAt: now,
    });

    const containerName = containerNameOverride || detectZimaOSContainer(infra);
    let restartResult = null;
    if (containerName && containerName !== "NO_RESTART") {
      try {
        const out = infra.restartContainer();
        restartResult = { ok: true, output: out };
      } catch (e: any) {
        restartResult = { ok: false, error: e.message };
      }
    }

    return {
      ok: true,
      synchronized: forgeAgentIds.length,
      mode: syncMode,
      via: syncVia,
      note:
        syncMode === 'api-virtual'
          ? `Gateway joignable mais sans outils d'écriture d'agents ; Forge conserve un registre virtuel (${VIRTUAL_AGENTS_CONFIG_KEY}) en attendant l'activation d'un tool de sync côté ZimaOS.`
          : undefined,
      autoEnabled,
      adoptedFromGateway,
      restart: restartResult,
    };
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const result = await performZimaOSAgentsSync(
      typeof body.containerName === 'string' ? body.containerName : undefined,
    );
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
};
