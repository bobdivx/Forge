import { useCallback, useEffect, useState } from 'preact/hooks';

type Diag = {
  ok: boolean;
  workSystem?: { state: string; inScheduledWindow?: boolean };
  budget?: { currentMonthlyEuros: number; capEuros: number; exceeded: boolean };
  projects?: { id: number; name: string; swarmEnabled: boolean }[];
  agents?: { agentId: string; enabled: boolean }[];
  recentDispatchFailures?: { at: string; details: string | null }[];
  error?: string;
};

export default function WorkDiagnosticPanel() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Diag | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/work-diagnostic')
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setErr(d?.ok === false ? d.error || 'Erreur' : null);
      })
      .catch((e) => setErr(String(e)));
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  return (
    <div class="border border-gray-200 rounded-[1.25rem] bg-white/80 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        class="w-full flex items-center justify-between px-4 py-3 text-left text-sm font-semibold text-gray-800 hover:bg-gray-50"
      >
        <span>Diagnostic supervision (swarm, budget, dispatch)</span>
        <span class="text-gray-400 text-lg">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div class="px-4 pb-4 space-y-3 text-sm">
          {err && <p class="text-red-600 text-xs">{err}</p>}
          {data?.workSystem && (
            <p class="text-gray-700">
              État travail :{' '}
              <strong class="font-mono">{String(data.workSystem.state)}</strong>
              {data.workSystem.inScheduledWindow != null
                ? ` · Fenêtre planifiée : ${data.workSystem.inScheduledWindow ? 'oui' : 'non'}`
                : ''}
            </p>
          )}
          {data?.budget && (
            <p class="text-gray-700">
              Budget : {(data.budget.currentMonthlyEuros ?? 0).toFixed(2)}€ / {(data.budget.capEuros ?? 0).toFixed(2)}€
              {data.budget.exceeded ? <span class="text-red-600 font-bold"> — dépassé</span> : null}
            </p>
          )}
          {data?.projects && (
            <div>
              <p class="text-[10px] font-bold uppercase text-gray-400 mb-1">Projets</p>
              <ul class="text-xs space-y-1 max-h-32 overflow-y-auto">
                {data.projects.map((p) => (
                  <li key={p.id} class="flex justify-between gap-2">
                    <span class="truncate">{p.name}</span>
                    <span class={p.swarmEnabled ? 'text-emerald-600' : 'text-amber-600'}>
                      {p.swarmEnabled ? 'swarm on' : 'swarm off'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {data?.recentDispatchFailures && data.recentDispatchFailures.length > 0 && (
            <div>
              <p class="text-[10px] font-bold uppercase text-red-500 mb-1">Échecs dispatch récents</p>
              <ul class="text-xs text-red-700 space-y-1 max-h-40 overflow-y-auto font-mono">
                {data.recentDispatchFailures.map((f, i) => (
                  <li key={i}>
                    {f.at} — {f.details || '—'}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button
            type="button"
            onClick={load}
            class="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50"
          >
            Rafraîchir
          </button>
        </div>
      )}
    </div>
  );
}
