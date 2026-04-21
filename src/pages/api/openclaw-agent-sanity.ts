import type { APIRoute } from 'astro';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAstroDb } from '../../lib/load-astro-db';
import { getForgeRepoRoot } from '../../lib/forge-repo-root';
import {
  fetchOpenClawAgentsList,
  readOpenClawLocalConfigFile,
} from '../../lib/openclaw-gateway';

type AgentSanityRow = {
  agentId: string;
  enabledInForge: boolean;
  hasDbPrompt: boolean;
  hasInstructionFile: boolean;
  instructionFilePath: string;
  inOpenClawAgentsListApi: boolean;
  inOpenClawLocalConfig: boolean;
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
    fetchOpenClawAgentsList(email),
    readOpenClawLocalConfigFile(),
  ]);

  const rows = await db.select().from(AgentInstruction);
  const apiSet = new Set(
    agentsListRes.agents.map((a) => String(a.id || '').trim().toUpperCase()).filter(Boolean),
  );
  const diskIds = readLocalConfigAgentIdsFromDisk(localCfg?.path || null);
  const diskSet = new Set(diskIds.map((id) => id.toUpperCase()));

  const checks: AgentSanityRow[] = rows
    .map((r) => {
      const agentId = String(r.agentId || '').trim();
      const prompt = String(r.systemPrompt || '').trim();
      const relPath = String(r.filePath || '').trim();
      const fullPath = relPath ? resolve(repoRoot, relPath) : '';
      const hasInstructionFile = Boolean(fullPath) && existsSync(fullPath);
      const enabledInForge = Number(r.enabled) === 1;
      const hasDbPrompt = prompt.length > 0;
      const inOpenClawAgentsListApi = apiSet.has(agentId.toUpperCase());
      const inOpenClawLocalConfig = diskSet.has(agentId.toUpperCase());
      const ready =
        enabledInForge &&
        hasDbPrompt &&
        hasInstructionFile &&
        (inOpenClawAgentsListApi || inOpenClawLocalConfig);

      return {
        agentId,
        enabledInForge,
        hasDbPrompt,
        hasInstructionFile,
        instructionFilePath: relPath,
        inOpenClawAgentsListApi,
        inOpenClawLocalConfig,
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

