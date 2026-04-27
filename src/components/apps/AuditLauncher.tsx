import { useState } from 'preact/hooks';

type AuditRole = { agentId: string; label: string };

type AgentResult = {
  agentId: string;
  label: string;
  model?: string;
  sessionKey: string | null;
  usedFallbackSession?: boolean;
  dispatched: boolean;
  queued: boolean;
  method?: string;
  attempts?: string[];
};

type AuditResponse = {
  ok: boolean;
  projectName: string;
  dispatchedCount: number;
  queuedCount: number;
  total: number;
  results: AgentResult[];
  note: string;
  error?: string;
};

const ALL_ROLES: AuditRole[] = [
  { agentId: 'CHEF_TECHNIQUE',  label: 'Coordination & synthèse' },
  { agentId: 'ANALYSTE_CODE',   label: 'Qualité & dette technique' },
  { agentId: 'SECURITE_CODE',   label: 'Sécurité & vulnérabilités' },
  { agentId: 'TESTEUR_QA',      label: 'Tests & couverture' },
  { agentId: 'DEV_BACKEND',     label: 'APIs & performance backend' },
  { agentId: 'DEV_FRONTEND',    label: 'Frontend, UX & accessibilité' },
];

function AgentBadge({ result }: { result: AgentResult }) {
  const [showLog, setShowLog] = useState(false);

  if (result.dispatched) {
    const fallbackNote = result.usedFallbackSession
      ? ` → session ${result.sessionKey ?? 'principale'}`
      : '';
    return (
      <div class="flex items-start gap-2 rounded-xl px-3 py-2 text-xs bg-green-50 text-green-700 border border-green-200">
        <span class="font-bold mt-0.5 shrink-0">✓</span>
        <div class="min-w-0">
          <div class="font-semibold font-mono">{result.agentId}</div>
          {result.model && (
            <div class="text-[9px] font-mono bg-green-100 text-green-600 px-1.5 py-0.5 rounded mt-0.5 inline-block">{result.model}</div>
          )}
          <div class="text-[10px] opacity-70 mt-0.5">{(result.method ?? 'dispatched') + fallbackNote}</div>
        </div>
      </div>
    );
  }

  return (
    <div class="rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs overflow-hidden">
      <div class="flex items-start gap-2 px-3 py-2">
        <span class="font-bold mt-0.5 shrink-0">✗</span>
        <div class="min-w-0 flex-1">
          <div class="font-semibold font-mono">{result.agentId}</div>
          {result.model && (
            <div class="text-[9px] font-mono bg-red-100 text-red-500 px-1.5 py-0.5 rounded mt-0.5 inline-block">{result.model}</div>
          )}
          <div class="text-[10px] opacity-70 mt-0.5">En file DB — toutes les méthodes ont échoué</div>
        </div>
        {result.attempts && result.attempts.length > 0 && (
          <button
            type="button"
            onClick={() => setShowLog((v) => !v)}
            class="text-[10px] underline shrink-0 opacity-70 hover:opacity-100"
          >
            {showLog ? 'Masquer' : 'Logs'}
          </button>
        )}
      </div>
      {showLog && result.attempts && (
        <div class="bg-red-100/60 px-3 pb-2 space-y-1">
          {result.attempts.map((a, i) => (
            <p key={i} class="text-[10px] font-mono break-all opacity-80">{a}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AuditLauncher({
  projectName,
  projectPath,
}: {
  projectName: string;
  projectPath?: string;
}) {
  const [selectedRoles, setSelectedRoles] = useState<string[]>(ALL_ROLES.map((r) => r.agentId));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  function toggleRole(agentId: string) {
    setSelectedRoles((prev) =>
      prev.includes(agentId) ? prev.filter((r) => r !== agentId) : [...prev, agentId],
    );
  }

  async function launch() {
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await fetch('/api/audit-launch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, projectPath, roles: selectedRoles }),
      });
      let data: AuditResponse;
      try { data = await res.json(); }
      catch { throw new Error(`Erreur serveur (${res.status})`); }
      if (!res.ok || !data.ok) throw new Error(data.error || `Erreur ${res.status}`);
      setResult(data);
      setExpanded(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 space-y-5">
      {/* Header */}
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 class="text-base font-semibold text-gray-900 flex items-center gap-2">
            <span class="text-lg">🔍</span>
            Audit du projet
          </h3>
          <p class="text-xs text-gray-400 mt-0.5">
            Chaque agent sélectionné analyse sa partie et reporte dans Forge
          </p>
        </div>
        {result && (
          <span class={`text-xs font-semibold px-3 py-1 rounded-full ${result.dispatchedCount > 0 ? 'bg-green-50 text-green-600' : 'bg-yellow-50 text-yellow-700'}`}>
            {result.dispatchedCount > 0
              ? `${result.dispatchedCount}/${result.total} agents notifiés`
              : `${result.queuedCount} en file DB`}
          </span>
        )}
      </div>

      {/* Sélection des agents */}
      <div>
        <p class="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wider">Agents participants</p>
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ALL_ROLES.map((role) => {
            const active = selectedRoles.includes(role.agentId);
            return (
              <button
                key={role.agentId}
                type="button"
                onClick={() => toggleRole(role.agentId)}
                class={`text-left rounded-xl px-3 py-2 border transition-all text-xs ${
                  active
                    ? 'border-[#175B37] bg-green-50 text-[#175B37]'
                    : 'border-gray-100 bg-gray-50 text-gray-400 hover:border-gray-200'
                }`}
              >
                <div class="font-semibold font-mono">{role.agentId}</div>
                <div class="text-[10px] opacity-70 mt-0.5">{role.label}</div>
              </button>
            );
          })}
        </div>
        <div class="flex gap-2 mt-2">
          <button
            type="button"
            onClick={() => setSelectedRoles(ALL_ROLES.map((r) => r.agentId))}
            class="text-[10px] text-gray-400 hover:text-gray-600 underline"
          >
            Tout sélectionner
          </button>
          <span class="text-gray-200">|</span>
          <button
            type="button"
            onClick={() => setSelectedRoles(['CHEF_TECHNIQUE'])}
            class="text-[10px] text-gray-400 hover:text-gray-600 underline"
          >
            Chef uniquement
          </button>
        </div>
      </div>

      {/* Bouton lancement */}
      <button
        type="button"
        onClick={launch}
        disabled={loading || selectedRoles.length === 0}
        class="w-full rounded-full py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2"
        style="background:#175B37"
      >
        {loading ? (
          <>
            <span class="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            Lancement en cours…
          </>
        ) : (
          <>
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 3l14 9-14 9V3z" />
            </svg>
            Lancer l'audit ({selectedRoles.length} agent{selectedRoles.length > 1 ? 's' : ''})
          </>
        )}
      </button>

      {/* Erreur */}
      {error && (
        <div class="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-600">
          {error}
        </div>
      )}

      {/* Résultats */}
      {result && (
        <div class="space-y-3">
          <div class="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-600">
            {result.note}
          </div>

          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            class="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg
              class={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
            >
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
            </svg>
            {expanded ? 'Masquer' : 'Voir'} le détail par agent
          </button>

          {expanded && (
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {result.results.map((r) => (
                <AgentBadge key={r.agentId} result={r} />
              ))}
            </div>
          )}

          {result.queuedCount > 0 && result.dispatchedCount === 0 && (
            <div class="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 space-y-2">
              <p class="font-semibold">⚠ Agents non joignables — tâches en file DB</p>
              <p>
                ZimaOS n'a pas de session active correspondant aux rôles.
                Clique sur <strong>Logs</strong> ci-dessus pour voir le détail des erreurs.
              </p>
              <p>
                La session détectée est probablement <strong>en veille (Telegram)</strong>.
                Pour la réveiller, envoie un message depuis Telegram ou démarre manuellement :
              </p>
              <pre class="bg-amber-100 rounded p-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap">{`docker exec zimaos zimaos start \\\n  --engine ollama --model qwen2.5:32b \\\n  --instructions /mnt/GitHub/Forge/instructions/SOUL.md`}</pre>
              <p>
                Ensuite relance l'audit, ou envoie une directive depuis la{' '}
                <a href="/agents" class="underline font-medium">page Agents</a>.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
