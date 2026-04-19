import { useState, useEffect } from 'preact/hooks';

type ModelRow = {
  agentId: string;
  openAiTarget: string;
  backendModel: string;
  enabled: boolean;
  inGatewayRegistry: boolean;
  inV1Models: boolean;
  ollamaPresent: boolean | null;
};

type PingResult = {
  ok: boolean;
  latencyMs: number;
  status: number;
  preview?: string;
  error?: string;
  viaDefaultFallback?: boolean;
  primaryAttemptError?: string;
};

type OllamaInfo = { configured: boolean; count: number; error?: string; hint?: string };

type MatrixData = {
  rows: ModelRow[];
  ollama: OllamaInfo;
  v1Models: { ok: boolean; httpReachable: boolean; sourceNote?: string; hint?: string };
  agentsList: { ok: boolean; count: number };
};

const STATUS_COLORS = {
  ok: 'bg-green-100 text-green-700 border-green-200',
  warn: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  err: 'bg-red-100 text-red-700 border-red-200',
  neutral: 'bg-gray-100 text-gray-500 border-gray-200',
};

function Badge({ ok, label, neutral }: { ok: boolean | null; label: string; neutral?: boolean }) {
  const cls =
    ok === null || neutral
      ? STATUS_COLORS.neutral
      : ok
        ? STATUS_COLORS.ok
        : STATUS_COLORS.err;
  return (
    <span class={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {ok === null || neutral ? '—' : ok ? '✓' : '✗'}
      {label}
    </span>
  );
}

function PingBadge({ result, loading }: { result: PingResult | null; loading: boolean }) {
  if (loading)
    return (
      <span class="inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[10px] font-semibold bg-blue-50 text-blue-600 border-blue-200">
        <span class="w-2.5 h-2.5 border border-blue-400 border-t-transparent rounded-full animate-spin inline-block" />
        Test…
      </span>
    );
  if (!result) return null;
  const cls = result.ok ? STATUS_COLORS.ok : STATUS_COLORS.err;
  const titleOk =
    (result.preview ?? '') +
    (result.viaDefaultFallback
      ? ' — Ping via openclaw/default + x-openclaw-model (l’agent openclaw/<rôle> n’est pas enregistré sur le gateway).'
      : '');
  const titleKo = result.error ?? '';
  return (
    <span
      class={`inline-flex items-center gap-1 border rounded-full px-2 py-0.5 text-[10px] font-semibold ${cls}`}
      title={result.ok ? titleOk : titleKo}
    >
      {result.ok ? '✓' : '✗'}
      {result.ok
        ? `${result.latencyMs}ms${result.viaDefaultFallback ? ' · défaut' : ''}`
        : 'Ping KO'}
    </span>
  );
}

export default function AgentModelMatrix() {
  const [data, setData] = useState<MatrixData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pings, setPings] = useState<Record<string, PingResult>>({});
  const [pinging, setPinging] = useState<Record<string, boolean>>({});
  const [pingAll, setPingAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [editModel, setEditModel] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [saveMsg, setSaveMsg] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/openclaw-models');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function pingAgent(row: ModelRow) {
    setPinging((p) => ({ ...p, [row.agentId]: true }));
    try {
      const res = await fetch('/api/openclaw-model-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openAiModel: row.openAiTarget, backendModel: row.backendModel }),
      });
      const json = await res.json();
      setPings((p) => ({ ...p, [row.agentId]: json }));
    } catch (e: any) {
      setPings((p) => ({ ...p, [row.agentId]: { ok: false, latencyMs: 0, status: 0, error: e.message } }));
    } finally {
      setPinging((p) => ({ ...p, [row.agentId]: false }));
    }
  }

  async function pingAll_() {
    if (!data) return;
    setPingAll(true);
    for (const row of data.rows) {
      await pingAgent(row);
    }
    setPingAll(false);
  }

  async function saveModel(agentId: string, model: string) {
    setSaving(agentId);
    setSaveMsg('');
    try {
      const res = await fetch('/api/agent-instructions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, model }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSaveMsg(`✓ Modèle ${agentId} mis à jour`);
      setEditing(null);
      load();
    } catch (e: any) {
      setSaveMsg(`✗ ${e.message}`);
    } finally {
      setSaving(null);
    }
  }

  const agentHealthScore = (row: ModelRow) => {
    let score = 0;
    if (row.enabled) score++;
    if (row.inGatewayRegistry) score++;
    if (row.inV1Models) score++;
    if (row.ollamaPresent === true) score++;
    return score;
  };

  if (loading) {
    return (
      <div class="flex items-center justify-center py-10 text-sm text-gray-400 gap-2">
        <span class="w-4 h-4 border-2 border-gray-200 border-t-[#175B37] rounded-full animate-spin" />
        Chargement des modèles…
      </div>
    );
  }

  if (error) {
    return (
      <div class="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-600">
        Erreur : {error}
        <button onClick={load} class="ml-2 underline">Réessayer</button>
      </div>
    );
  }

  if (!data) return null;

  const totalAgents = data.rows.length;
  const fullyOk = data.rows.filter((r) => agentHealthScore(r) === 4).length;
  const partialOk = data.rows.filter((r) => { const s = agentHealthScore(r); return s >= 2 && s < 4; }).length;
  const broken = data.rows.filter((r) => agentHealthScore(r) < 2).length;

  return (
    <div class="space-y-4">
      {/* Résumé global */}
      <div class="grid grid-cols-3 gap-3 text-center">
        <div class="bg-green-50 border border-green-100 rounded-xl p-3">
          <div class="text-2xl font-bold text-green-700">{fullyOk}</div>
          <div class="text-[10px] text-green-600 font-medium mt-0.5">Agents complets</div>
        </div>
        <div class="bg-yellow-50 border border-yellow-100 rounded-xl p-3">
          <div class="text-2xl font-bold text-yellow-700">{partialOk}</div>
          <div class="text-[10px] text-yellow-600 font-medium mt-0.5">Partiels</div>
        </div>
        <div class="bg-red-50 border border-red-100 rounded-xl p-3">
          <div class="text-2xl font-bold text-red-700">{broken}</div>
          <div class="text-[10px] text-red-600 font-medium mt-0.5">Incomplets</div>
        </div>
      </div>

      {/* Notes de contexte */}
      {data.ollama && !data.ollama.configured && (
        <div class="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-xs text-blue-700">
          <strong>Ollama non configuré pour la liste des tags</strong> — Renseignez l’<strong>URL Ollama</strong> dans{' '}
          <strong>Paramètres → Connexion OpenClaw</strong> (puis « Sauvegarder la connexion »), ou définissez{' '}
          <code class="bg-blue-100 px-1 rounded">OLLAMA_HOST</code> sur le conteneur (équivalent).
        </div>
      )}
      {data.v1Models?.sourceNote && (
        <div class="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-[10px] text-gray-500">
          {data.v1Models.sourceNote}
        </div>
      )}

      {/* Actions */}
      <div class="flex items-center justify-between flex-wrap gap-2">
        <p class="text-xs text-gray-500">
          {totalAgents} agents · Gateway : {data.agentsList.ok ? `${data.agentsList.count} enregistrés` : '⚠ non joignable'} · Ollama : {data.ollama.configured ? `${data.ollama.count} modèles` : 'non configuré'}
        </p>
        <div class="flex items-center gap-2">
          <button
            onClick={load}
            class="text-xs border border-gray-200 bg-white rounded-full px-3 py-1.5 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ↻ Rafraîchir
          </button>
          <button
            onClick={pingAll_}
            disabled={pingAll}
            class="text-xs border border-[#175B37] bg-[#175B37] text-white rounded-full px-3 py-1.5 hover:bg-[#0f3d25] transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {pingAll && <span class="w-2.5 h-2.5 border border-white/40 border-t-white rounded-full animate-spin" />}
            Tester tous
          </button>
        </div>
      </div>

      {saveMsg && (
        <div class={`rounded-xl px-3 py-2 text-xs ${saveMsg.startsWith('✓') ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
          {saveMsg}
        </div>
      )}

      {/* Tableau */}
      <div class="overflow-x-auto rounded-2xl border border-gray-100">
        <table class="min-w-full text-xs">
          <thead>
            <tr class="bg-gray-50 border-b border-gray-100">
              <th class="text-left px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Agent</th>
              <th class="text-left px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Modèle Ollama</th>
              <th class="text-left px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Cible OpenAI</th>
              <th class="text-left px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Statuts</th>
              <th class="text-left px-4 py-3 font-semibold text-gray-500 text-[10px] uppercase tracking-wider">Ping</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-50">
            {data.rows.map((row) => {
              const score = agentHealthScore(row);
              const rowBg = score === 4 ? '' : score >= 2 ? 'bg-yellow-50/30' : 'bg-red-50/30';
              const isEditing = editing === row.agentId;
              return (
                <tr key={row.agentId} class={`hover:bg-gray-50/60 transition-colors ${rowBg}`}>
                  <td class="px-4 py-3">
                    <div class="font-mono font-semibold text-gray-900">{row.agentId}</div>
                    {!row.enabled && (
                      <span class="text-[9px] text-gray-400 font-medium">désactivé</span>
                    )}
                  </td>
                  <td class="px-4 py-3">
                    {isEditing ? (
                      <div class="flex items-center gap-1.5">
                        <input
                          autoFocus
                          value={editModel}
                          onInput={(e) => setEditModel((e.target as HTMLInputElement).value)}
                          class="bg-white border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono text-gray-900 w-36 focus:border-[#175B37] outline-none"
                          placeholder="qwen2.5:32b"
                        />
                        <button
                          onClick={() => saveModel(row.agentId, editModel)}
                          disabled={saving === row.agentId}
                          class="text-[10px] bg-[#175B37] text-white rounded-full px-2 py-0.5 font-semibold disabled:opacity-50"
                        >
                          OK
                        </button>
                        <button
                          onClick={() => setEditing(null)}
                          class="text-[10px] text-gray-400 hover:text-gray-600 rounded-full px-1"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        class="flex items-center gap-1.5 group"
                        title="Cliquer pour modifier"
                        onClick={() => { setEditing(row.agentId); setEditModel(row.backendModel); setSaveMsg(''); }}
                      >
                        <code class={`font-mono text-xs px-2 py-0.5 rounded-md ${row.backendModel ? 'bg-gray-100 text-gray-700' : 'bg-red-50 text-red-500 border border-red-100'}`}>
                          {row.backendModel || '— non défini —'}
                        </code>
                        <svg class="w-3 h-3 text-gray-300 group-hover:text-gray-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                          <path stroke-linecap="round" stroke-linejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                        </svg>
                      </button>
                    )}
                  </td>
                  <td class="px-4 py-3">
                    <code class="font-mono text-[10px] text-gray-500 bg-gray-50 px-2 py-0.5 rounded">
                      {row.openAiTarget}
                    </code>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center flex-wrap gap-1">
                      <Badge ok={row.inGatewayRegistry} label="Gateway" />
                      <Badge ok={row.inV1Models} label="/v1/models" />
                      <Badge
                        ok={row.ollamaPresent}
                        label="Ollama"
                        neutral={row.ollamaPresent === null}
                      />
                    </div>
                  </td>
                  <td class="px-4 py-3">
                    <div class="flex items-center gap-2">
                      <PingBadge result={pings[row.agentId] ?? null} loading={pinging[row.agentId] ?? false} />
                      {!pinging[row.agentId] && (
                        <button
                          onClick={() => pingAgent(row)}
                          class="text-[10px] text-gray-400 hover:text-[#175B37] transition-colors underline"
                          title={`Tester ${row.openAiTarget}`}
                        >
                          {pings[row.agentId] ? 'Retester' : 'Ping'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p class="text-[10px] text-gray-400 text-center">
        Les modèles sont modifiables en cliquant sur la cellule. Le ping teste via POST /v1/chat/completions (surface OpenAI du gateway).
      </p>
    </div>
  );
}
