import type { APIRoute } from 'astro';
import { db } from 'astro:db';
import { AgentInstruction } from 'astro:db';
import {
  fetchZimaOSAgentsList,
  invokeZimaOSAgentTask,
  invokeZimaOSSessionsSend,
  resolveSessionsSendKey,
} from '../../lib/zimaos-gateway';
import { buildSwarmWorkDirective } from '../../lib/forge-agent-protocol';
import { getAppUpdateInfo } from '../../lib/app-update-check';
import { attemptZimaOSPreRepair } from './_zimaos-pre-repair';

const CHIEF_AGENT_ID = 'CHEF_TECHNIQUE';

export const POST: APIRoute = async ({ locals }) => {
  const email = locals.user?.email as string | undefined;
  let directive = buildSwarmWorkDirective('start_work', 'direct');
  let preRepair: { attempted: boolean; ok: boolean; note?: string; error?: string } | undefined;
  const updateInfo = await getAppUpdateInfo().catch(() => null);
  if (updateInfo?.updateAvailable && updateInfo.latestVersion && updateInfo.currentVersion) {
    directive = [
      directive,
      '',
      '[FORGE_APP_UPDATE_CHECK]',
      `Version installée: ${updateInfo.currentVersion}`,
      `Version GitHub disponible: ${updateInfo.latestVersion}`,
      updateInfo.latestUrl ? `Release: ${updateInfo.latestUrl}` : '',
      "Avant de démarrer la mission, prends en compte cette version plus récente et adapte le travail demandé.",
    ]
      .filter(Boolean)
      .join('\n');
  }

  let registry = await fetchZimaOSAgentsList(email);
  const shouldAttemptRepair =
    registry.ok &&
    (registry.allowAny === false ||
      registry.agents.length <= 1 ||
      registry.agents.every((a) => String(a.id || '').trim().toUpperCase() === CHIEF_AGENT_ID));
  if (shouldAttemptRepair) {
    preRepair = await attemptZimaOSPreRepair('wake-agents-allowlist');
    registry = await fetchZimaOSAgentsList(email);
  }
  if (!registry.ok) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: registry.error || 'Impossible de lire la liste des agents ZimaOS.',
        preRepair,
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const enabledRows = await db
    .select({ agentId: AgentInstruction.agentId, enabled: AgentInstruction.enabled })
    .from(AgentInstruction);
  const enabledIds = new Set(
    enabledRows
      .filter((r) => Number(r.enabled) === 1)
      .map((r) => String(r.agentId || '').trim().toUpperCase())
      .filter(Boolean),
  );

  const registryIds = registry.agents
    .map((a) => String(a.id || '').trim())
    .filter(Boolean);
  const targetIds = registryIds.filter((id) => {
    const upper = id.toUpperCase();
    if (enabledIds.size === 0) return true;
    return enabledIds.has(upper);
  });

  const sent: string[] = [];
  const failed: Array<{ agentId: string; error: string }> = [];

  for (const agentId of targetIds) {
    const resolved =
      (await resolveSessionsSendKey(email, [agentId]).catch(() => null)) || agentId;
    const direct = await invokeZimaOSSessionsSend({
      sessionKey: resolved,
      message: directive,
      timeoutSeconds: 45,
      asyncDelivery: true,
    });
    if (direct.ok) {
      sent.push(agentId);
      continue;
    }
    const fallback = await invokeZimaOSAgentTask({
      agentId,
      message: directive,
    });
    if (fallback.ok) {
      sent.push(agentId);
      continue;
    }
    failed.push({
      agentId,
      error: String(fallback.error || direct.error || 'Réveil refusé').slice(0, 400),
    });
  }

  // Fallback chef: utile si certains agents n'ont pas de session créée.
  if (failed.length > 0) {
    const chiefInstruction = [
      'FORGE_WAKE_SWARM',
      "Action: réveille les agents suivants si leur session n'est pas active.",
      failed.map((f) => `- ${f.agentId}`).join('\n'),
      'Réponds avec la liste des agents effectivement réveillés.',
    ].join('\n');
    const chief = await invokeZimaOSAgentTask({
      agentId: CHIEF_AGENT_ID,
      message: chiefInstruction,
    });
    if (chief.ok) {
      return new Response(
        JSON.stringify({
          ok: true,
          sent,
          failed,
          preRepair,
          viaChiefFallback: true,
          chiefAgentId: CHIEF_AGENT_ID,
          targeted: targetIds.length,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }
  }

  return new Response(
    JSON.stringify({
      ok: failed.length === 0,
      sent,
      failed,
      preRepair,
      targeted: targetIds.length,
      registryCount: registryIds.length,
      enabledCount: enabledIds.size,
    }),
    {
      status: failed.length === 0 ? 200 : 207,
      headers: { 'Content-Type': 'application/json' },
    },
  );
};
