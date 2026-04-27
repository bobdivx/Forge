import type { APIRoute } from 'astro';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAstroDb } from '../../lib/load-astro-db';
import { getForgeRepoRoot } from '../../lib/forge-repo-root';
import {
  fetchZimaOSAgentsList,
  readZimaOSLocalConfigFile,
} from '../../lib/zimaos-gateway';
import { normForgeAgentKey } from '../../lib/forge-agent-id';

type AgentSanityRow = {
  agentId: string;
  enabledInForge: boolean;
  hasDbPrompt: boolean;
  hasInstructionFile: boolean;
  /** Fichier attendu absent sur l’hôte (ex. déploiement sans copie `doc/` ni fallback legacy). */
  instructionFileMissingOnHost: boolean;
  instructionFilePath: string;
  inZimaOSAgentsListApi: boolean;
  inZimaOSLocalConfig: boolean;
  /** Activé + prompt non vide + enregistré ZimaOS (liste API ou zimaos.json local) ; le fichier .md sur disque est informatif. */
  ready: boolean;
};

function readLocalConfigAgentIdsFromDisk(path: string | null): string[] {
  if (!path) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const agents = (parsed.agents ?? {}) as Record<string, unknown>;
    const list = Array.isArray(agents.list) ? (agents.list as unknown[]) : [];
    return list
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
        return String((item as Record<string, unknown>).id ?? '').trim();
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email as string | undefined;
  const repoRoot = getForgeRepoRoot();

  const [{ db, AgentInstruction }, agentsListRes, localCfg] = await Promise.all([
    loadAstroDb(),
    fetchZimaOSAgentsList(email),
    readZimaOSLocalConfigFile(),
  ]);

  const rows = await db.select().from(AgentInstruction);
  const apiSet = new Set(
    agentsListRes.agents.map((a) => normForgeAgentKey(String(a.id ?? ''))).filter(Boolean),
  );
  const diskIds = readLocalConfigAgentIdsFromDisk(localCfg?.path || null);
  const diskSet = new Set(diskIds.map((id) => normForgeAgentKey(id)).filter(Boolean));

  const checks: AgentSanityRow[] = rows
    .map((r) => {
      const agentId = String(r.agentId || '').trim();
      const prompt = String(r.systemPrompt || '').trim();
      const relPath = String(r.filePath || '').trim();
      const fullPath = relPath ? resolve(repoRoot, relPath) : '';
      const hasInstructionFile = Boolean(fullPath) && existsSync(fullPath);
      const enabledInForge = Number(r.enabled) === 1;
      const hasDbPrompt = prompt.length > 0;
      const key = normForgeAgentKey(agentId);
      const inZimaOSAgentsListApi = apiSet.has(key);
      const inZimaOSLocalConfig = diskSet.has(key);
      const instructionFileMissingOnHost = hasDbPrompt && !hasInstructionFile;
      const zimaosRegistered = inZimaOSAgentsListApi || inZimaOSLocalConfig;
      const ready = enabledInForge && hasDbPrompt && zimaosRegistered;

      return {
        agentId,
        enabledInForge,
        hasDbPrompt,
        hasInstructionFile,
        instructionFileMissingOnHost,
        instructionFilePath: relPath,
        inZimaOSAgentsListApi,
        inZimaOSLocalConfig,
        ready,
      };
    })
    .sort((a, b) => a.agentId.localeCompare(b.agentId));

  const readyCount = checks.filter((c) => c.ready).length;
  return new Response(
    JSON.stringify(
      {
        ok: true,
        summary: {
          total: checks.length,
          ready: readyCount,
          notReady: checks.length - readyCount,
          missingInstructionFileOnHostCount: checks.filter((c) => c.instructionFileMissingOnHost).length,
        },
        gatewayAgentsList: {
          ok: agentsListRes.ok,
          status: agentsListRes.status,
          error: agentsListRes.error,
          count: agentsListRes.agents.length,
        },
        localConfig: {
          path: localCfg?.path || null,
          count: diskIds.length,
        },
        checks,
      },
      null,
      2,
    ),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};

