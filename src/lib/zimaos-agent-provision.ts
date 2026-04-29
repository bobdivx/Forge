import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getForgeRepoRoot } from './forge-repo-root';
import {
  fetchZimaOSJson,
  fetchZimaOSAgentsList,
  invokeZimaOSSessionsSend,
  readZimaOSLocalConfigFile,
} from './zimaos-gateway';

type ProvisionStep = {
  strategy: 'write_instruction_file' | 'gateway_agents_upsert' | 'delegate_to_chief';
  ok: boolean;
  detail?: string;
};

export type ProvisionAgentResult = {
  ok: boolean;
  steps: ProvisionStep[];
};

type ConfigSnapshot = {
  path: string;
  raw: string;
  size: number;
};

function isLikelyHealthyZimaOSConfig(raw: string): boolean {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const hasGateway = parsed.gateway && typeof parsed.gateway === 'object';
    const hasModels = parsed.models && typeof parsed.models === 'object';
    const hasAgents = parsed.agents && typeof parsed.agents === 'object';
    return Boolean(hasGateway && hasModels && hasAgents);
  } catch {
    return false;
  }
}

async function snapshotZimaOSConfig(infra: any): Promise<ConfigSnapshot | null> {
  const local = await readZimaOSLocalConfigFile();
  const filePath = local?.path;
  if (!filePath) return null;
  try {
    const raw = infra.readFile(filePath);
    return { path: filePath, raw, size: Buffer.byteLength(raw, 'utf-8') };
  } catch {
    return null;
  }
}

async function rollbackZimaOSConfig(infra: any, snapshot: ConfigSnapshot): Promise<string | null> {
  try {
    infra.writeFile(snapshot.path, snapshot.raw);
    return null;
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
}

function buildDelegatePrompt(params: {
  agentId: string;
  model: string;
  systemPrompt: string;
}): string {
  return [
    `[FORGE_AGENT_CREATE] ${params.agentId}`,
    '',
    "Action demandée: crée (ou mets à jour) l'agent ZimaOS suivant.",
    `- agentId: ${params.agentId}`,
    `- model: ${params.model}`,
    '',
    'Instructions système à appliquer:',
    params.systemPrompt,
    '',
    "Réponds avec: 'OK AGENT CREATED <agentId>' si terminé, sinon indique le blocage précis.",
  ]
    .join('\n')
    .slice(0, 120_000);
}

export async function provisionAgentInZimaOS(params: {
  agentId: string;
  model: string;
  filePath: string;
  systemPrompt: string;
}): Promise<ProvisionAgentResult> {
  const steps: ProvisionStep[] = [];

  // 1) Stratégie locale: écrire le fichier d'instructions (seulement si demandé)
  if (params.filePath && params.filePath.endsWith('.md')) {
    try {
      const repoRoot = getForgeRepoRoot();
      const fullPath = resolve(repoRoot, params.filePath);
      mkdirSync(dirname(fullPath), { recursive: true });
      writeFileSync(fullPath, params.systemPrompt, 'utf-8');
      steps.push({ strategy: 'write_instruction_file', ok: true, detail: params.filePath });
    } catch (e: unknown) {
      steps.push({
        strategy: 'write_instruction_file',
        ok: false,
        detail: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // 2) Stratégie API gateway: tenter agents_upsert avec TOUTES les infos (DB-first)
  const { getZimaOSInfraClient } = await import('./zimaos-infra-client');
  const infra = await getZimaOSInfraClient();
  const configBefore = await snapshotZimaOSConfig(infra);
  const upsert = await fetchZimaOSJson(undefined, '/tools/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'agents_upsert',
      action: 'json',
      args: {
        agents: [{ 
          id: params.agentId, 
          name: params.agentId,
          model: params.model,
          systemPrompt: params.systemPrompt,
          // Si on est en mode DB, on peut aussi signaler au gateway de ne pas chercher de fichier
          provider: 'ollama', 
        }],
      },
    }),
  });
  if (upsert.ok) {
    if (!configBefore) {
      steps.push({
        strategy: 'gateway_agents_upsert',
        ok: true,
        detail: 'upsert_ok; no_local_config_snapshot',
      });
    } else {
      let safe = true;
      let detail = 'upsert_ok';
      try {
        const afterRaw = infra.readFile(configBefore.path);
        const afterSize = Buffer.byteLength(afterRaw, 'utf-8');
        const severeShrink = afterSize < Math.floor(configBefore.size * 0.5);
        const missingCoreSections = !isLikelyHealthyZimaOSConfig(afterRaw);
        if (severeShrink || missingCoreSections) {
          safe = false;
          const rollbackErr = await rollbackZimaOSConfig(infra, configBefore);
          detail = rollbackErr
            ? `unsafe_config_detected(size:${configBefore.size}->${afterSize}, missingCoreSections:${missingCoreSections}); rollback_failed:${rollbackErr}`
            : `unsafe_config_detected(size:${configBefore.size}->${afterSize}, missingCoreSections:${missingCoreSections}); rollback_done`;
        }
      } catch (e: unknown) {
        safe = false;
        const msg = e instanceof Error ? e.message : String(e);
        const rollbackErr = await rollbackZimaOSConfig(infra, configBefore);
        detail = rollbackErr
          ? `post_upsert_check_failed:${msg}; rollback_failed:${rollbackErr}`
          : `post_upsert_check_failed:${msg}; rollback_done`;
      }
      steps.push({ strategy: 'gateway_agents_upsert', ok: safe, detail });
    }
  } else {
    steps.push({
      strategy: 'gateway_agents_upsert',
      ok: false,
      detail: upsert.error || `HTTP ${upsert.status}`,
    });
  }

  // 3) Fallback: déléguer au chef (ou premier agent disponible)
  const list = await fetchZimaOSAgentsList(undefined);
  const candidates = list.ok ? list.agents.map((a) => String(a.id || '').trim()).filter(Boolean) : [];
  const chief =
    candidates.find((id) => id.toUpperCase() === 'CHEF_TECHNIQUE') ||
    candidates[0] ||
    'CHEF_TECHNIQUE';
  const delegated = await invokeZimaOSSessionsSend({
    sessionKey: chief,
    message: buildDelegatePrompt({
      agentId: params.agentId,
      model: params.model,
      systemPrompt: params.systemPrompt,
    }),
    timeoutSeconds: 90,
    asyncDelivery: true,
  });
  if (delegated.ok) {
    steps.push({
      strategy: 'delegate_to_chief',
      ok: true,
      detail: `sent_to=${chief}`,
    });
  } else {
    steps.push({
      strategy: 'delegate_to_chief',
      ok: false,
      detail: delegated.error || 'delegate failed',
    });
  }

  const ok = steps.some((s) => s.ok);
  return { ok, steps };
}

