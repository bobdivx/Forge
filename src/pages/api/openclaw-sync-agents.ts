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
import { getConfig } from '../../lib/config-db';
import { loadAstroDb } from '../../lib/load-astro-db';

async function resolveOpenClawJsonCandidates(): Promise<string[]> {
  const appDataDir = (await getConfig('dockerAppDataDir')).trim() || 'C:\\DATA\\AppData';
  const base = appDataDir.replace(/[\\/]+$/, '');
  return [
    join(base, 'openclaw', 'openclaw.json'),
    join(base, 'AppData', 'openclaw', 'openclaw.json'),
  ];
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

async function getForgeAgentIds(): Promise<string[]> {
  try {
    const { db, AgentInstruction } = await loadAstroDb();
    const rows = await db.select({ agentId: AgentInstruction.agentId, enabled: AgentInstruction.enabled }).from(AgentInstruction);
    return rows.filter((r) => r.enabled === 1).map((r) => r.agentId);
  } catch {
    return ['CHEF_TECHNIQUE', 'ARCHITECTE_LOGICIEL', 'DEV_BACKEND', 'DEV_FRONTEND'];
  }
}

export const GET: APIRoute = async () => {
  try {
    const { path, candidates } = await resolveOpenClawJsonPath();
    const exists = existsSync(path);
    const forgeAgentIds = await getForgeAgentIds();
    const container = detectOpenClawContainer();

    if (!exists) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Config introuvable : ${path}`,
          triedPaths: candidates,
          forgeAgents: forgeAgentIds,
          container,
        }),
        { status: 200 },
      );
    }

    const config = readOpenClawJson(path);
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const currentList = Array.isArray(agents.list) ? (agents.list as any[]) : [];
    const currentIds = currentList.map((a) => a.id);

    return new Response(JSON.stringify({
      ok: true,
      path,
      container,
      current: currentIds,
      forgeAgents: forgeAgentIds,
      toAdd: forgeAgentIds.filter(id => !currentIds.includes(id)),
      upToDate: forgeAgentIds.every(id => currentIds.includes(id)),
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

    if (!existsSync(path)) {
      throw new Error(`Chemin de configuration openclaw.json inaccessible : ${path}. Chemins testés: ${candidates.join(', ')}`);
    }

    const config = readOpenClawJson(path);
    const forgeAgentIds = await getForgeAgentIds();
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const existingList = Array.isArray(agents.list) ? (agents.list as any[]) : [];

    // Fusion des agents
    const forgeSet = new Set(forgeAgentIds);
    const keepExisting = existingList.filter((a) => !forgeSet.has(a.id));
    const newList = [...forgeAgentIds.map(id => ({ id })), ...keepExisting];
    config.agents = { ...agents, list: newList };

    writeOpenClawJson(path, config);

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

    return new Response(JSON.stringify({ ok: true, synchronized: forgeAgentIds.length, restart: restartResult }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500 });
  }
};
