import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { getForgeRepoRoot } from './forge-repo-root';
import {
  fetchOpenClawJson,
  fetchOpenClawAgentsList,
  invokeOpenClawSessionsSend,
} from './openclaw-gateway';

type ProvisionStep = {
  strategy: 'write_instruction_file' | 'gateway_agents_upsert' | 'delegate_to_chief';
  ok: boolean;
  detail?: string;
};

export type ProvisionAgentResult = {
  ok: boolean;
  steps: ProvisionStep[];
};

function buildDelegatePrompt(params: {
  agentId: string;
  model: string;
  systemPrompt: string;
}): string {
  return [
    `[FORGE_AGENT_CREATE] ${params.agentId}`,
    '',
    "Action demandée: crée (ou mets à jour) l'agent OpenClaw suivant.",
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

export async function provisionAgentInOpenClaw(params: {
  agentId: string;
  model: string;
  filePath: string;
  systemPrompt: string;
}): Promise<ProvisionAgentResult> {
  const steps: ProvisionStep[] = [];

  // 1) Stratégie locale: écrire le fichier d'instructions dans le repo Forge
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

  // 2) Stratégie API gateway: tenter agents_upsert (si tool exposé)
  const upsert = await fetchOpenClawJson(undefined, '/tools/invoke', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'agents_upsert',
      action: 'json',
      args: {
        agents: [{ id: params.agentId }],
      },
    }),
  });
  if (upsert.ok) {
    steps.push({ strategy: 'gateway_agents_upsert', ok: true });
  } else {
    steps.push({
      strategy: 'gateway_agents_upsert',
      ok: false,
      detail: upsert.error || `HTTP ${upsert.status}`,
    });
  }

  // 3) Fallback: déléguer au chef (ou premier agent disponible)
  const list = await fetchOpenClawAgentsList(undefined);
  const candidates = list.ok ? list.agents.map((a) => String(a.id || '').trim()).filter(Boolean) : [];
  const chief =
    candidates.find((id) => id.toUpperCase() === 'CHEF_TECHNIQUE') ||
    candidates[0] ||
    'CHEF_TECHNIQUE';
  const delegated = await invokeOpenClawSessionsSend({
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

