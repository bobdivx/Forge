import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import {
  fetchOpenClawAgentsList,
  getOpenClawClientDebugMeta,
} from '../../lib/openclaw-gateway';
import {
  collectOpenClawV1ModelEntries,
  fetchOllamaTagNames,
  measureOpenClawHealthRoundTrip,
  mergeOpenClawV1ModelEntries,
  syntheticOpenClawTargetsFromAgents,
  syntheticOpenClawTargetsFromForgeAgentIds,
} from '../../lib/openclaw-openai-surface';

/** Correspondance registre gateway ↔ ids métier Forge (casse + préfixe openclaw/). */
function gatewayRegistryKeySet(agents: { id: string }[]): Set<string> {
  const s = new Set<string>();
  for (const a of agents) {
    const raw = String(a.id || '').trim();
    if (!raw) continue;
    s.add(raw.toLowerCase());
    const bare = raw.replace(/^openclaw\//i, '').trim();
    if (bare) s.add(bare.toLowerCase());
  }
  return s;
}

export type OpenClawModelsRow = {
  agentId: string;
  openAiTarget: string;
  backendModel: string;
  enabled: boolean;
  inGatewayRegistry: boolean;
  inV1Models: boolean;
  /** null si Ollama non configuré côté serveur Forge */
  ollamaPresent: boolean | null;
};

export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email as string | undefined;

  const [meta, health, agentsRes, ollama, v1disc] = await Promise.all([
    getOpenClawClientDebugMeta(),
    measureOpenClawHealthRoundTrip(email),
    fetchOpenClawAgentsList(email),
    fetchOllamaTagNames(),
    collectOpenClawV1ModelEntries(email),
  ]);

  let instructions: {
    agentId: string;
    model: string;
    enabled: number;
  }[] = [];

  try {
    const { db, AgentInstruction } = await loadAstroDb();
    const rows = await db
      .select({
        agentId: AgentInstruction.agentId,
        model: AgentInstruction.model,
        enabled: AgentInstruction.enabled,
      })
      .from(AgentInstruction);
    instructions = rows;
  } catch {
    /* DB absente */
  }

  let v1Entries = v1disc.entries;
  const httpParsedCount = v1Entries.length;
  let supplementedFromAgents = false;
  let supplementedFromForge = false;
  if (v1Entries.length === 0) {
    const fromAgents =
      agentsRes.ok && agentsRes.agents.length > 0
        ? syntheticOpenClawTargetsFromAgents(agentsRes.agents)
        : [];
    const fromForge =
      instructions.length > 0
        ? syntheticOpenClawTargetsFromForgeAgentIds(instructions.map((r) => r.agentId))
        : [];
    const merged = mergeOpenClawV1ModelEntries(fromAgents, fromForge);
    if (merged.length > 0) {
      v1Entries = merged;
      supplementedFromAgents = fromAgents.length > 0;
      supplementedFromForge = fromForge.length > 0;
    }
  }

  const v1Lower = new Set(v1Entries.map((e) => e.id.toLowerCase()));

  let v1SourceNote: string | undefined;
  if (supplementedFromAgents || supplementedFromForge) {
    if (v1disc.anyHttpOk && httpParsedCount === 0) {
      v1SourceNote =
        'Le gateway a répondu sur /v1/models mais la liste était vide ou illisible ; les cibles openclaw/… affichées combinent agents_list et les rôles définis dans Forge. Remarque : ce n’est pas le catalogue Ollama / providers — ce sont les identifiants de modèle « compat Open WebUI » (agent cible).';
    } else if (!v1disc.anyHttpOk) {
      v1SourceNote =
        'GET /v1/models (et /api/v1/models) injoignable ou refusé ; cibles openclaw/… dérivées de agents_list et/ou des instructions Forge. Vérifiez gateway.http.endpoints.chatCompletions.enabled et le token.';
    }
    if (supplementedFromForge && !v1SourceNote) {
      v1SourceNote =
        'Cibles openclaw/… dérivées des instructions Forge (agents_list et HTTP /v1/models n’ont pas fourni de liste exploitable).';
    }
  }

  const registryKeys = gatewayRegistryKeySet(agentsRes.agents);
  const ollamaLower = new Set(ollama.names.map((n) => n.toLowerCase()));

  const rows: OpenClawModelsRow[] = instructions.map((row) => {
    const target = `openclaw/${row.agentId}`;
    const backend = String(row.model || '').trim();
    let ollamaPresent: boolean | null = null;
    if (ollama.configured) {
      ollamaPresent = backend ? ollamaLower.has(backend.toLowerCase()) : false;
    }
    return {
      agentId: row.agentId,
      openAiTarget: target,
      backendModel: backend,
      enabled: row.enabled === 1,
      inGatewayRegistry: registryKeys.has(row.agentId.toLowerCase()),
      inV1Models: v1Lower.has(target.toLowerCase()),
      ollamaPresent,
    };
  });

  rows.sort((a, b) => a.agentId.localeCompare(b.agentId));

  const v1OnlyAgents = v1Entries
    .map((e) => e.id)
    .filter((id) => id.toLowerCase().startsWith('openclaw/') && id.toLowerCase() !== 'openclaw/default')
    .map((id) => id.replace(/^openclaw\//i, ''))
    .filter((agentId) => !instructions.some((r) => r.agentId === agentId));

  return new Response(
    JSON.stringify({
      gatewayMeta: meta,
      health,
      v1Models: {
        /** Au moins une cible affichable (HTTP parsé et/ou complément agents_list). */
        ok: v1Entries.length > 0,
        status: v1disc.lastStatus,
        error: v1disc.anyHttpOk ? undefined : v1disc.lastError,
        httpReachable: v1disc.anyHttpOk,
        entries: v1Entries,
        httpParsedCount,
        supplementedFromAgents,
        triedPaths: v1disc.triedPaths,
        sourceNote: v1SourceNote,
        hint:
          !v1disc.anyHttpOk && v1disc.lastStatus === 404
            ? 'Activez gateway.http.endpoints.chatCompletions dans OpenClaw pour exposer GET /v1/models (voir docs.openclaw.ai).'
            : !v1disc.anyHttpOk
              ? 'Vérifiez OPENCLAW_GATEWAY_URL / token et que le port HTTP du gateway est bien celui configuré.'
              : httpParsedCount === 0 && !supplementedFromAgents && !supplementedFromForge
                ? 'Aucune entrée sur /v1/models et agents_list vide — enregistrez des agents côté OpenClaw ou corrigez le format de réponse du gateway.'
                : undefined,
      },
      agentsList: {
        ok: agentsRes.ok,
        status: agentsRes.status,
        error: agentsRes.error,
        count: agentsRes.agents.length,
      },
      ollama: {
        configured: ollama.configured,
        count: ollama.names.length,
        error: ollama.error,
        hint: !ollama.configured
          ? 'Renseignez l’URL Ollama dans Paramètres → Connexion OpenClaw (section « Modèles agents » utilise ce réglage), ou définissez OLLAMA_HOST sur le conteneur.'
          : undefined,
      },
      rows,
      v1AgentsWithoutInstruction: [...new Set(v1OnlyAgents)].sort(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
