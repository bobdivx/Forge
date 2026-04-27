import { useCallback, useEffect, useState } from 'preact/hooks';
import SectionCard from '../ui/SectionCard';

type ModelsPayload = {
  gatewayMeta: {
    gatewayBaseUrl: string;
    tokenConfigured: boolean;
  };
  health: { ok: boolean; status: number; latencyMs: number; error?: string };
  v1Models: {
    ok: boolean;
    status: number;
    error?: string;
    entries: { id: string; ownedBy?: string }[];
    hint?: string;
    httpParsedCount?: number;
    supplementedFromAgents?: boolean;
    triedPaths?: string[];
    sourceNote?: string;
    /** GET /v1/models (ou /api/v1/models) a répondu sans erreur HTTP. */
    httpReachable?: boolean;
  };
  agentsList: { ok: boolean; status: number; error?: string; count: number };
  ollama: {
    configured: boolean;
    count: number;
    error?: string;
    hint?: string;
  };
  rows: {
    agentId: string;
    openAiTarget: string;
    backendModel: string;
    enabled: boolean;
    inGatewayRegistry: boolean;
    inV1Models: boolean;
    ollamaPresent: boolean | null;
  }[];
  v1AgentsWithoutInstruction: string[];
};

type PingResult = {
  ok: boolean;
  latencyMs: number;
  status: number;
  preview?: string;
  error?: string;
  hint?: string;
};

function Badge({
  ok,
  label,
  title,
}: {
  ok: boolean | null;
  label: string;
  title?: string;
}) {
  if (ok === null) {
    return (
      <span
        class="text-[10px] px-2 py-0.5 rounded-full border border-slate-600 text-slate-500"
        title={title}
      >
        {label}
      </span>
    );
  }
  return (
    <span
      class={`text-[10px] px-2 py-0.5 rounded-full border ${
        ok
          ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
          : 'border-rose-500/40 text-rose-300 bg-rose-500/10'
      }`}
      title={title}
    >
      {label}
    </span>
  );
}

export default function ZimaOSModelsPanel() {
  const [data, setData] = useState<ModelsPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draftModels, setDraftModels] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [pingByAgent, setPingByAgent] = useState<Record<string, PingResult | null>>({});
  const [actionMsg, setActionMsg] = useState<{ text: string; type: 'ok' | 'err' } | null>(null);
  const [globalPrompt, setGlobalPrompt] = useState('Réponds uniquement par le mot PONG.');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const r = await fetch('/api/zimaos-models');
      const j = await r.json();
      if (!r.ok) {
        setLoadError((j as { error?: string }).error ?? `HTTP ${r.status}`);
        setData(null);
        return;
      }
      const payload = j as ModelsPayload;
      setData(payload);
      const drafts: Record<string, string> = {};
      for (const row of payload.rows) {
        drafts[row.agentId] = row.backendModel;
      }
      setDraftModels(drafts);
    } catch {
      setLoadError('Réseau ou serveur injoignable.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveModel(agentId: string) {
    const model = (draftModels[agentId] ?? '').trim();
    if (!model) return;
    setSavingId(agentId);
    setActionMsg(null);
    try {
      const r = await fetch('/api/agent-instructions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, model }),
      });
      const j = await r.json();
      if (!j.ok) {
        setActionMsg({ type: 'err', text: j.error ?? 'Sauvegarde refusée' });
        return;
      }
      setActionMsg({ type: 'ok', text: `Modèle enregistré pour ${agentId}.` });
      await load();
    } catch {
      setActionMsg({ type: 'err', text: 'Erreur réseau lors de la sauvegarde.' });
    } finally {
      setSavingId(null);
    }
  }

  async function ping(agentId: string, openAiTarget: string) {
    setPingingId(agentId);
    setPingByAgent((p) => ({ ...p, [agentId]: null }));
    try {
      const r = await fetch('/api/zimaos-model-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openAiModel: openAiTarget,
          backendModel: draftModels[agentId] ?? undefined,
          userMessage: globalPrompt,
          maxTokens: 24,
        }),
      });
      const j = (await r.json()) as PingResult;
      setPingByAgent((p) => ({ ...p, [agentId]: j }));
    } catch {
      setPingByAgent((p) => ({
        ...p,
        [agentId]: { ok: false, latencyMs: 0, status: 0, error: 'Erreur réseau' },
      }));
    } finally {
      setPingingId(null);
    }
  }

  if (loading && !data) {
    return (
      <div class="text-slate-400 text-sm animate-pulse">Chargement des modèles ZimaOS…</div>
    );
  }

  if (loadError) {
    return (
      <SectionCard title="Erreur" description="Impossible de charger l’agrégat modèles.">
        <p class="text-rose-300 text-sm">{loadError}</p>
        <button type="button" class="btn btn-sm btn-outline border-cyan-500/30 text-cyan-200" onClick={() => void load()}>
          Réessayer
        </button>
      </SectionCard>
    );
  }

  if (!data) return null;

  return (
    <div class="space-y-8 max-w-7xl mx-auto">
      <div>
        <h2 class="text-2xl font-bold tracking-tight text-white">IA &amp; modèles ZimaOS</h2>
        <p class="mt-1 text-sm text-slate-400">
          <code class="text-slate-500 font-mono text-xs">GET /v1/models</code> expose les{' '}
          <strong class="text-slate-300">cibles agent</strong> au format OpenAI (<code class="text-slate-500 font-mono text-xs">zimaos/…</code>
          ), pas les noms de modèles Ollama déclarés dans la config providers. Les modèles backend par agent Forge sont dans le tableau ci‑dessous ; latence mesurée via{' '}
          <code class="text-slate-500 font-mono text-xs">POST /v1/chat/completions</code>.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="rounded-xl border border-cyan-500/20 bg-slate-900/80 p-4">
          <p class="text-[11px] uppercase tracking-wide text-slate-500">Gateway</p>
          <p class="text-sm font-mono text-cyan-100/90 truncate mt-1" title={data.gatewayMeta.gatewayBaseUrl}>
            {data.gatewayMeta.gatewayBaseUrl}
          </p>
          <p class="text-xs text-slate-500 mt-2">
            Token : {data.gatewayMeta.tokenConfigured ? 'configuré' : 'manquant'}
          </p>
        </div>
        <div class="rounded-xl border border-cyan-500/20 bg-slate-900/80 p-4">
          <p class="text-[11px] uppercase tracking-wide text-slate-500">Santé HTTP</p>
          <p class={`text-2xl font-semibold mt-1 ${data.health.ok ? 'text-emerald-300' : 'text-rose-300'}`}>
            {data.health.latencyMs} ms
          </p>
          <p class="text-xs text-slate-500 mt-1">
            GET /health — {data.health.ok ? 'OK' : data.health.error ?? `HTTP ${data.health.status}`}
          </p>
        </div>
        <div class="rounded-xl border border-cyan-500/20 bg-slate-900/80 p-4">
          <p class="text-[11px] uppercase tracking-wide text-slate-500">Cibles zimaos/…</p>
          <p class={`text-2xl font-semibold mt-1 ${data.v1Models.ok ? 'text-emerald-300' : 'text-amber-300'}`}>
            {data.v1Models.ok ? `${data.v1Models.entries.length}\u00a0entrées` : 'Indispo'}
          </p>
          {typeof data.v1Models.httpParsedCount === 'number' && data.v1Models.httpParsedCount > 0 && (
            <p class="text-[10px] text-slate-500 mt-1">
              dont {data.v1Models.httpParsedCount} depuis le HTTP /v1/models
            </p>
          )}
          {data.v1Models.httpReachable === false && data.v1Models.ok && (
            <p class="text-[10px] text-slate-500 mt-1">HTTP /v1/models non joint ; liste issue du registre agents.</p>
          )}
          {data.v1Models.supplementedFromAgents && (
            <p class="text-[10px] text-amber-200/80 mt-1">
              Complété depuis <span class="font-mono">agents_list</span>
            </p>
          )}
          {data.v1Models.sourceNote && (
            <p class="text-[11px] text-slate-400 mt-2 leading-snug">{data.v1Models.sourceNote}</p>
          )}
          {!data.v1Models.ok && data.v1Models.hint && (
            <p class="text-[11px] text-slate-500 mt-2 leading-snug">{data.v1Models.hint}</p>
          )}
        </div>
        <div class="rounded-xl border border-cyan-500/20 bg-slate-900/80 p-4">
          <p class="text-[11px] uppercase tracking-wide text-slate-500">Ollama (optionnel)</p>
          <p class="text-2xl font-semibold text-slate-200 mt-1">
            {data.ollama.configured ? `${data.ollama.count} tags` : '—'}
          </p>
          {data.ollama.configured && data.ollama.error && (
            <p class="text-xs text-rose-300 mt-1">{data.ollama.error}</p>
          )}
          {!data.ollama.configured && data.ollama.hint && (
            <p class="text-[11px] text-slate-500 mt-2 leading-snug">{data.ollama.hint}</p>
          )}
        </div>
      </div>

      <SectionCard
        title="Prompt de test"
        description="Utilisé pour chaque mesure de latence (chat completions). Gardez un message court pour comparer les modèles."
      >
        <textarea
          class="w-full min-h-[72px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:border-cyan-500 outline-none"
          value={globalPrompt}
          onInput={(e) => setGlobalPrompt((e.target as HTMLTextAreaElement).value)}
        />
      </SectionCard>

      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          class="btn btn-sm border border-cyan-500/30 bg-cyan-500/10 text-cyan-100 hover:bg-cyan-500/20"
          onClick={() => void load()}
          disabled={loading}
        >
          {loading ? 'Actualisation…' : 'Actualiser'}
        </button>
        <span class="text-xs text-slate-500">
          agents_list :{' '}
          {data.agentsList.ok ? `${data.agentsList.count} agent(s)` : data.agentsList.error ?? 'erreur'}
        </span>
        {actionMsg && (
          <span
            class={`text-xs ${actionMsg.type === 'ok' ? 'text-emerald-400' : 'text-rose-400'}`}
          >
            {actionMsg.text}
          </span>
        )}
      </div>

      {data.v1AgentsWithoutInstruction.length > 0 && (
        <div class="rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm text-amber-100/90">
          <p class="font-medium text-amber-200/95">Cibles /v1 sans fiche instructions Forge</p>
          <p class="text-xs text-amber-200/70 mt-1">
            {data.v1AgentsWithoutInstruction.join(', ')} — ajoutez-les en base ou ignorez si ce sont des alias
            internes.
          </p>
        </div>
      )}

      <SectionCard
        title="Agents Forge ↔ ZimaOS"
        description="Modèle backend (souvent Ollama) stocké en base ; la colonne « test » mesure le temps jusqu’à la première réponse du gateway."
      >
        {data.rows.length === 0 && (
          <p class="text-sm text-slate-500">
            Aucune instruction agent en base (Astro DB). Vérifiez la connexion DB ou lancez le seed / synchronisation des agents.
          </p>
        )}
        <div class="overflow-x-auto -mx-2">
          <table class="table table-sm w-full text-left">
            <thead>
              <tr class="border-b border-slate-700 text-[11px] uppercase tracking-wide text-slate-500">
                <th class="py-2 pr-3">Agent</th>
                <th class="py-2 pr-3">Cible OpenAI</th>
                <th class="py-2 pr-3">Modèle backend</th>
                <th class="py-2 pr-3">Statuts</th>
                <th class="py-2 pr-3 w-[220px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => {
                const pingResult = pingByAgent[row.agentId];
                return (
                  <tr key={row.agentId} class="border-b border-slate-800/80 align-top">
                    <td class="py-3 pr-3">
                      <span class="font-mono text-sm text-white">{row.agentId}</span>
                      {!row.enabled && (
                        <span class="ml-2 text-[10px] text-slate-500">(désactivé)</span>
                      )}
                    </td>
                    <td class="py-3 pr-3 font-mono text-xs text-cyan-200/80">{row.openAiTarget}</td>
                    <td class="py-3 pr-3">
                      <input
                        type="text"
                        class="w-full min-w-[140px] bg-slate-950 border border-slate-700 rounded-md px-2 py-1.5 text-xs font-mono text-white focus:border-cyan-500 outline-none"
                        value={draftModels[row.agentId] ?? ''}
                        onInput={(e) =>
                          setDraftModels((d) => ({
                            ...d,
                            [row.agentId]: (e.target as HTMLInputElement).value,
                          }))
                        }
                      />
                    </td>
                    <td class="py-3 pr-3">
                      <div class="flex flex-wrap gap-1">
                        <Badge ok={row.inGatewayRegistry} label="registre" title="Présent dans agents_list ZimaOS" />
                        <Badge ok={row.inV1Models} label="/v1" title="Listé par GET /v1/models" />
                        <Badge
                          ok={row.ollamaPresent}
                          label="ollama"
                          title={
                            row.ollamaPresent === null
                              ? 'URL Ollama non configurée (Paramètres → Connexion ZimaOS) ou OLLAMA_HOST absent'
                              : 'Tag présent sur Ollama'
                          }
                        />
                      </div>
                      {pingResult && (
                        <p
                          class={`mt-2 text-xs font-mono ${pingResult.ok ? 'text-emerald-300' : 'text-rose-300'}`}
                        >
                          {pingResult.ok
                            ? `${pingResult.latencyMs} ms — ${(pingResult.preview ?? '').slice(0, 120)}`
                            : `${pingResult.latencyMs} ms — ${pingResult.error ?? 'erreur'}`}
                        </p>
                      )}
                      {pingResult?.hint && <p class="text-[10px] text-slate-500 mt-1">{pingResult.hint}</p>}
                    </td>
                    <td class="py-3 pr-0">
                      <div class="flex flex-wrap gap-2">
                        <button
                          type="button"
                          class="btn btn-xs border border-slate-600 text-slate-200 hover:border-cyan-500/40"
                          onClick={() => void saveModel(row.agentId)}
                          disabled={
                          savingId === row.agentId ||
                          (draftModels[row.agentId] ?? '').trim() === (row.backendModel ?? '').trim()
                        }
                        >
                          {savingId === row.agentId ? '…' : 'Enregistrer'}
                        </button>
                        <button
                          type="button"
                          class="btn btn-xs border border-cyan-500/35 bg-cyan-500/10 text-cyan-100"
                          onClick={() => void ping(row.agentId, row.openAiTarget)}
                          disabled={pingingId === row.agentId}
                        >
                          {pingingId === row.agentId ? 'Test…' : 'Tester'}
                        </button>
                        <a
                          class="btn btn-xs btn-ghost text-slate-400 hover:text-cyan-200"
                          href={`/agents/instructions`}
                        >
                          Instructions
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </div>
  );
}
