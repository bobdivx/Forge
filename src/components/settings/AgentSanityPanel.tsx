import { useEffect, useMemo, useState } from 'preact/hooks';

type AgentCheck = {
  agentId: string;
  enabledInForge: boolean;
  hasDbPrompt: boolean;
  hasInstructionFile: boolean;
  instructionFilePath: string;
  inOpenClawAgentsListApi: boolean;
  inOpenClawLocalConfig: boolean;
  ready: boolean;
};

type SanityPayload = {
  summary?: { total: number; ready: number; notReady: number };
  checks?: AgentCheck[];
};

export default function AgentSanityPanel() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<SanityPayload>({});

  const checks = Array.isArray(data.checks) ? data.checks : [];
  const koChecks = useMemo(() => checks.filter((c) => !c.ready), [checks]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/openclaw-agent-sanity');
      const payload = (await res.json().catch(() => ({}))) as SanityPayload & { error?: string };
      if (!res.ok) {
        setError(payload.error || `HTTP ${res.status}`);
        setData({});
        return;
      }
      setData(payload);
    } catch {
      setError('Impossible de charger le diagnostic agents.');
      setData({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div class="rounded-2xl border border-gray-100 bg-white p-4 space-y-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 class="text-sm font-semibold text-gray-900">Santé des agents</h3>
          <p class="text-[11px] text-gray-500">
            Vérifie l’activation Forge, le prompt DB, le fichier d’instruction et la présence OpenClaw.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          class="text-xs border border-gray-200 rounded-full px-3 py-1.5 text-gray-600 hover:bg-gray-50"
        >
          Rafraîchir
        </button>
      </div>

      {loading && <div class="text-xs text-gray-400">Chargement du diagnostic…</div>}
      {!loading && error && <div class="text-xs text-red-600">{error}</div>}

      {!loading && !error && (
        <div class="space-y-3">
          <div class="text-xs text-gray-600">
            {data.summary?.ready ?? 0}/{data.summary?.total ?? checks.length} agents prêts
          </div>

          <div class="max-h-64 overflow-auto border border-gray-100 rounded-xl">
            <table class="w-full text-xs">
              <thead class="bg-gray-50 text-gray-500">
                <tr>
                  <th class="text-left px-3 py-2 font-semibold">Agent</th>
                  <th class="text-left px-3 py-2 font-semibold">État</th>
                  <th class="text-left px-3 py-2 font-semibold">Détails</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr class="border-t border-gray-100" key={c.agentId}>
                    <td class="px-3 py-2 font-mono text-[11px] text-gray-700">{c.agentId}</td>
                    <td class="px-3 py-2">
                      <span
                        class={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          c.ready ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {c.ready ? 'OK' : 'KO'}
                      </span>
                    </td>
                    <td class="px-3 py-2 text-[11px] text-gray-500">
                      {!c.ready
                        ? [
                            !c.enabledInForge ? 'désactivé' : '',
                            !c.hasDbPrompt ? 'prompt DB manquant' : '',
                            !c.hasInstructionFile ? 'fichier instruction absent' : '',
                            !c.inOpenClawAgentsListApi && !c.inOpenClawLocalConfig
                              ? 'absent OpenClaw'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(', ')
                        : 'prêt'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {koChecks.length > 0 && (
            <div class="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              {koChecks.length} agent(s) nécessitent une correction avant exécution fiable.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

