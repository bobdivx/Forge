import type { APIRoute } from 'astro';
import { loadAstroDb } from '../../lib/load-astro-db';
import { FORGE_DEFAULT_AGENT_MODELS } from '../../lib/agent-model-defaults';
import { getSelectableOllamaModels } from '../../lib/ollama-model-availability';

type ModelEntry = { id: string; name: string; ownedBy: string };

export const GET: APIRoute = async ({ request }) => {
  try {
    const { db, AgentModel, AgentInstruction } = await loadAstroDb();
    const now = new Date();
    const filterActive = new URL(request.url).searchParams.get('filter') === 'active';

    // 0. Base locale stable (DB)
    let dbEnabled: { id: string; name: string; ownedBy: string }[] = [];
    try {
      if (AgentModel) {
        let dbCatalog = await db.select().from(AgentModel);
        if (dbCatalog.length === 0) {
          await db.insert(AgentModel).values(
            FORGE_DEFAULT_AGENT_MODELS.map((m) => ({
              id: m.id,
              label: m.label,
              source: 'seed',
              enabled: 1,
              updatedAt: now,
            })),
          );
          dbCatalog = await db.select().from(AgentModel);
        } else {
          const existing = new Set(dbCatalog.map((m) => String(m.id).trim()));
          for (const m of FORGE_DEFAULT_AGENT_MODELS) {
            if (existing.has(m.id)) continue;
            await db.insert(AgentModel).values({
              id: m.id,
              label: m.label,
              source: 'seed',
              enabled: 1,
              updatedAt: now,
            });
          }
          dbCatalog = await db.select().from(AgentModel);
        }
        dbEnabled = dbCatalog
          .filter((m) => Number(m.enabled) === 1)
          .map((m) => ({
            id: String(m.id).trim(),
            name: String(m.label || m.id).trim() || String(m.id).trim(),
            ownedBy: 'forge-db',
          }));
      }
    } catch {
      // Schéma/table potentiellement non migré: on continue sans bloquer l'endpoint.
      dbEnabled = FORGE_DEFAULT_AGENT_MODELS.map((m) => ({
        id: m.id,
        name: m.label,
        ownedBy: 'forge-default',
      }));
    }
    const instructionModelsRaw = await db.select({ model: AgentInstruction.model }).from(AgentInstruction);
    const instructionModels = instructionModelsRaw
      .map((row) => String(row.model || '').trim())
      .filter(Boolean)
      .map((id) => ({ id: id, name: id, ownedBy: 'forge-instruction' }));
    
    // 1. Tags Ollama (instances actives)
    let ollamaTagNames: string[] = [];
    let extraOllamaModels: ModelEntry[] = [];
    try {
        const ollamaRes = await import('../../lib/forge-openai-surface').then(m => m.fetchOllamaTagNames());
        ollamaTagNames = ollamaRes.names;
        extraOllamaModels = ollamaRes.names.map(name => ({
            id: name,
            name: name,
            ownedBy: 'ollama-instances',
        }));
    } catch {
        // ignore if Ollama is unreachable
    }

    // Discussion / sélecteurs : catalogue DB activé ∩ présent sur Ollama, hors désactivés / Forge KO
    if (filterActive) {
      const selectable = await getSelectableOllamaModels();
      const selectableEntries = selectable.map((m) => ({
        id: m.name,
        name: m.name,
        ownedBy: m.compatibility?.ok ? 'ollama-forge-ok' : 'ollama-instances',
      }));
      const onDisk = new Set(selectable.map((m) => m.name));
      const pickKnown = (entries: ModelEntry[]) => entries.filter((m) => onDisk.has(m.id));

      const merged = [...selectableEntries, ...pickKnown(dbEnabled), ...pickKnown(instructionModels)];
      const uniqueModels = Array.from(new Map(merged.map((m) => [m.id, m])).values()).sort((a, b) =>
        a.id.localeCompare(b.id),
      );

      return new Response(JSON.stringify(uniqueModels), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Fusion unique (par ID) — liste large pour écrans paramètres / matrice
    const allModels = [...dbEnabled, ...instructionModels, ...extraOllamaModels];
    const uniqueModels = Array.from(new Map(allModels.map(m => [m.id, m])).values());

    return new Response(JSON.stringify(uniqueModels), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
