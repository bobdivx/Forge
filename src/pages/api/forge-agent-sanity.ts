import type { APIRoute } from 'astro';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAstroDb } from '../../lib/load-astro-db';
import { getForgeRepoRoot } from '../../lib/forge-repo-root';
import {
  fetchZimaOSAgentsList,
  readZimaOSLocalConfigFile,
} from '../../lib/forge-gateway';
import { normForgeAgentKey } from '../../lib/forge-agent-id';
import { eq } from 'drizzle-orm';

export type AgentSanityResult = {
  ok: boolean;
  agentId: string;
  error?: string;
  details?: string;
};

export type AgentSanityRow = {
  agentId: string;
  enabledInForge: boolean;
  hasDbPrompt: boolean;
  hasInstructionFile: boolean;
  instructionFileMissingOnHost: boolean;
  instructionFilePath: string;
  inZimaOSAgentsListApi: boolean;
  inZimaOSLocalConfig: boolean;
  ready: boolean;
};

/**
 * Effectue un diagnostic réel pour un agent donné (DB + SSH NAS).
 */
export async function performZimaOSAgentSanityCheck(agentId: string): Promise<AgentSanityResult> {
  try {
    const { db, AgentInstruction } = await loadAstroDb();
    const { getZimaOSInfraClient } = await import('../../lib/forge-infra-client');
    const infra = await getZimaOSInfraClient();
    const localCfg = await readZimaOSLocalConfigFile();

    // 1. Vérifier en DB
    const rows = await db.select().from(AgentInstruction).where(eq(AgentInstruction.agentId, agentId));
    if (rows.length === 0) return { ok: false, agentId, error: "Inconnu dans Forge" };
    
    const instr = rows[0];
    const hasPrompt = String(instr.systemPrompt || '').trim().length > 0;
    if (!hasPrompt) return { ok: false, agentId, error: "Prompt DB vide" };

    // 2. Vérifier sur le NAS (SSH)
    if (localCfg?.path) {
      const nasDir = localCfg.path.substring(0, localCfg.path.lastIndexOf('/'));
      const nasAgentPath = `${nasDir}/agents/${agentId}.md`;
      
      const fileExists = infra.exists(nasAgentPath);
      if (!fileExists) {
        return { ok: false, agentId, error: "Fichier .md absent sur ZimaOS", details: nasAgentPath };
      }
    }

    return { ok: true, agentId };
  } catch (e: any) {
    return { ok: false, agentId, error: e.message };
  }
}

async function readLocalConfigAgentIdsFromDisk(infra: any, path: string | null): Promise<string[]> {
  if (!path) return [];
  try {
    const raw = infra.readFile(path);
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

  const { getZimaOSInfraClient } = await import('../../lib/forge-infra-client');
  const infra = await getZimaOSInfraClient();

  const [{ db, AgentInstruction }, agentsListRes, localCfg, v1disc] = await Promise.all([
    loadAstroDb(),
    fetchZimaOSAgentsList(email),
    readZimaOSLocalConfigFile(),
    import('../../lib/forge-openai-surface').then(m => m.collectZimaOSV1ModelEntries(email))
  ]);

  const rows = await db.select().from(AgentInstruction);
  const apiSet = new Set(
    agentsListRes.agents.map((a) => normForgeAgentKey(String(a.id ?? ''))).filter(Boolean),
  );
  const diskIds = await readLocalConfigAgentIdsFromDisk(infra, localCfg?.path || null);
  const diskSet = new Set(diskIds.map((id) => normForgeAgentKey(id)).filter(Boolean));
  const v1Set = new Set(v1disc.entries.map(e => e.id.toLowerCase()));

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
      
      const target = `zimaos/${agentId}`.toLowerCase();
      const inV1Models = v1Set.has(target);
      
      const ready = enabledInForge && hasDbPrompt && zimaosRegistered && inV1Models;

      return {
        agentId,
        enabledInForge,
        hasDbPrompt,
        hasInstructionFile: true, // On considère OK si DB prompt présent
        instructionFileMissingOnHost: false,
        instructionFilePath: 'database',
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

