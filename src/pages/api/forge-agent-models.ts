import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import { getOllamaOriginResolved } from '../../lib/config-db';

type OllamaTagsResponse = {
  models?: { name?: string; model?: string }[];
};

async function fetchOllamaTagNames(): Promise<{ configured: boolean; names: string[]; error?: string }> {
  const origin = await getOllamaOriginResolved();
  if (!origin) return { configured: false, names: [] };

  try {
    const res = await fetch(`${origin.replace(/\/+$/, '')}/api/tags`);
    if (!res.ok) {
      return { configured: true, names: [], error: `Ollama HTTP ${res.status}` };
    }
    const data = (await res.json()) as OllamaTagsResponse;
    const names = Array.isArray(data.models)
      ? data.models
          .map((m) => String(m.name || m.model || '').trim())
          .filter(Boolean)
      : [];
    return { configured: true, names };
  } catch (e) {
    return {
      configured: true,
      names: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export const GET: APIRoute = async () => {
  const { db, AgentInstruction } = await loadAstroDb();
  const instructions = await db
    .select({
      agentId: AgentInstruction.agentId,
      model: AgentInstruction.model,
      enabled: AgentInstruction.enabled,
    })
    .from(AgentInstruction);

  const ollama = await fetchOllamaTagNames();
  const ollamaLower = new Set(ollama.names.map((name) => name.toLowerCase()));

  const rows = instructions
    .map((row) => {
      const backendModel = String(row.model || '').trim();
      return {
        agentId: String(row.agentId || '').trim(),
        backendModel,
        enabled: Number(row.enabled) === 1,
        ollamaPresent: ollama.configured && backendModel ? ollamaLower.has(backendModel.toLowerCase()) : null,
      };
    })
    .filter((row) => row.agentId)
    .sort((a, b) => a.agentId.localeCompare(b.agentId));

  return new Response(
    JSON.stringify({
      ok: true,
      source: 'forge-db',
      rows,
      ollama: {
        configured: ollama.configured,
        count: ollama.names.length,
        error: ollama.error,
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};
