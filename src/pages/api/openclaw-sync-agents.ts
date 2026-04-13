/**
 * Synchronise la liste d'agents Forge → openclaw.json du gateway.
 *
 * GET  — aperçu : lit openclaw.json et retourne l'état actuel vs ce que Forge veut pousser.
 * POST — écrit les agents Forge dans agents.list de openclaw.json + redémarre le conteneur.
 *
 * Chemin openclaw.json : {dockerAppDataDir}/openclaw/openclaw.json
 * Conteneur cible      : détecté via `docker ps` (contient "openclaw") ou forçable via body.containerName.
 */
import type { APIRoute } from 'astro';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getConfig } from '../../lib/config-db';
import { loadAstroDb } from '../../lib/load-astro-db';

// ── Helpers ──────────────────────────────────────────────────────────────────

async function resolveOpenClawJsonPath(): Promise<string> {
  const appDataDir = (await getConfig('dockerAppDataDir')).trim() || '/DATA/AppData';
  return join(appDataDir, 'openclaw', 'openclaw.json');
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
    const out = execSync("docker ps --format '{{.Names}}' 2>/dev/null", { timeout: 5000 })
      .toString()
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return out.find((n) => n.toLowerCase().includes('openclaw')) ?? null;
  } catch {
    return null;
  }
}

function restartContainer(name: string): { ok: boolean; output: string } {
  try {
    const out = execSync(`docker restart ${name} 2>&1`, { timeout: 30_000 }).toString().trim();
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, output: e instanceof Error ? e.message : String(e) };
  }
}

async function getForgeAgentIds(): Promise<string[]> {
  try {
    const { db, AgentInstruction } = await loadAstroDb();
    const rows = await db
      .select({ agentId: AgentInstruction.agentId, enabled: AgentInstruction.enabled })
      .from(AgentInstruction);
    return rows.filter((r) => r.enabled === 1).map((r) => r.agentId);
  } catch {
    // fallback : liste en dur si DB indisponible
    return [
      'CHEF_TECHNIQUE', 'ARCHITECTE_LOGICIEL', 'DEV_BACKEND', 'DEV_FRONTEND',
      'EXPERT_GITHUB', 'ANALYSTE_CODE', 'TESTEUR_QA', 'INFRA_TECH',
      'SECURITE_CODE', 'INGENIEUR_HARDWARE', 'INGENIEUR_PROMPT',
      'MAINTENANCE_REPO', 'REDACTEUR_DOC', 'SCRIPTEUR_AUTOMATE', 'VEILLE_TECH',
    ];
  }
}

// ── GET — aperçu ─────────────────────────────────────────────────────────────

export const GET: APIRoute = async () => {
  try {
    const path = await resolveOpenClawJsonPath();

    if (!existsSync(path)) {
      return new Response(
        JSON.stringify({ ok: false, error: `openclaw.json introuvable : ${path}`, path }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const config = readOpenClawJson(path);
    const agents = config.agents as Record<string, unknown> | undefined;
    const currentList: { id: string }[] = Array.isArray(agents?.list)
      ? (agents!.list as { id: string }[])
      : [];

    const forgeAgentIds = await getForgeAgentIds();
    const currentIds = currentList.map((a) => a.id);

    const toAdd = forgeAgentIds.filter((id) => !currentIds.includes(id));
    const alreadyPresent = forgeAgentIds.filter((id) => currentIds.includes(id));
    const notInForge = currentIds.filter((id) => !forgeAgentIds.includes(id));

    const container = detectOpenClawContainer();

    return new Response(
      JSON.stringify({
        ok: true,
        path,
        container,
        current: currentIds,
        forgeAgents: forgeAgentIds,
        toAdd,
        alreadyPresent,
        notInForge,
        upToDate: toAdd.length === 0,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// ── POST — écriture + redémarrage ─────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
  let body: { restart?: boolean; containerName?: string; agentIds?: string[] } = {};
  try {
    body = await request.json();
  } catch {
    /* pas de body = defaults */
  }

  try {
    const path = await resolveOpenClawJsonPath();

    if (!existsSync(path)) {
      return new Response(
        JSON.stringify({ ok: false, error: `openclaw.json introuvable : ${path}`, path }),
        { status: 404, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const config = readOpenClawJson(path);

    // Agents à pousser : body.agentIds ou tous les agents Forge activés
    const forgeAgentIds = Array.isArray(body.agentIds) && body.agentIds.length > 0
      ? body.agentIds
      : await getForgeAgentIds();

    // Fusion : on garde les agents OpenClaw existants qui ne sont pas dans Forge (ex. main)
    // et on ajoute/normalise tous les agents Forge.
    const agents = (config.agents ?? {}) as Record<string, unknown>;
    const existingList: { id: string }[] = Array.isArray(agents.list)
      ? (agents.list as { id: string }[])
      : [];

    const forgeSet = new Set(forgeAgentIds);
    const keepExisting = existingList.filter((a) => !forgeSet.has(a.id));
    const forgeEntries = forgeAgentIds.map((id) => ({ id }));
    const newList = [...forgeEntries, ...keepExisting];

    config.agents = { ...agents, list: newList };

    // Sauvegarde atomique : backup avant d'écrire
    const backupPath = path + '.bak.forge';
    writeFileSync(backupPath, readFileSync(path), undefined);
    writeOpenClawJson(path, config);

    // Redémarrage optionnel (défaut : true)
    const shouldRestart = body.restart !== false;
    let containerResult: { ok: boolean; output: string } | null = null;
    const containerName = body.containerName || detectOpenClawContainer();

    if (shouldRestart && containerName) {
      containerResult = restartContainer(containerName);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        path,
        backupPath,
        agentsPushed: forgeAgentIds,
        totalAgents: newList.length,
        container: containerName,
        restart: containerResult,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
