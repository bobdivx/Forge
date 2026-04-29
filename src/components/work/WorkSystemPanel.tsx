import { useEffect, useMemo, useState } from 'preact/hooks';

type WorkSystemStatus = {
  state: 'running' | 'stopped' | 'scheduled';
  schedulerActive: boolean;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  inScheduledWindow: boolean;
  nextWindowAt: string | null;
};

function fmtDate(v: string | null): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export default function WorkSystemPanel() {
  const [status, setStatus] = useState<WorkSystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<'start' | 'stop' | 'schedule' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const stateBadge = useMemo(() => {
    const s = status?.state || 'scheduled';
    if (s === 'running') return { cls: 'bg-emerald-50 text-emerald-700', label: 'En cours' };
    if (s === 'stopped') return { cls: 'bg-rose-50 text-rose-700', label: 'Arrêté' };
    return { cls: 'bg-amber-50 text-amber-700', label: 'Planifié' };
  }, [status?.state]);

  async function refresh() {
    setError(null);
    try {
      const res = await fetch('/api/work-system');
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Erreur API /api/work-system');
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function runAction(action: 'start' | 'stop' | 'schedule') {
    setBusyAction(action);
    setError(null);
    try {
      const res = await fetch('/api/work-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Erreur action ${action}`);
      setStatus(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyAction(null);
    }
  }

  useEffect(() => {
    void refresh();
    const t = setInterval(() => {
      void refresh();
    }, 20_000);
    return () => clearInterval(t);
  }, []);

  return (
    <section class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-5">
      <div class="flex flex-wrap items-center gap-2">
        <h3 class="text-base font-bold text-gray-900">Supervision automatique</h3>
        <span class={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${stateBadge.cls}`}>
          {stateBadge.label}
        </span>
      </div>
      <p class="mt-1 text-xs text-gray-500">
        Chef superviseur: <span class="font-semibold text-gray-700">CHEF_TECHNIQUE</span> (prioritaire), avec dispatch sur les agents actifs.
      </p>

      {loading ? (
        <p class="mt-3 text-xs text-gray-400">Chargement…</p>
      ) : (
        <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div class="rounded-xl bg-gray-50 p-3">
            <p class="text-gray-400">Scheduler actif</p>
            <p class="font-semibold text-gray-700">{status?.schedulerActive ? 'Oui' : 'Non'}</p>
          </div>
          <div class="rounded-xl bg-gray-50 p-3">
            <p class="text-gray-400">Dans la plage horaire</p>
            <p class="font-semibold text-gray-700">{status?.inScheduledWindow ? 'Oui' : 'Non'}</p>
          </div>
          <div class="rounded-xl bg-gray-50 p-3">
            <p class="text-gray-400">Dernier démarrage</p>
            <p class="font-semibold text-gray-700">{fmtDate(status?.lastStartedAt ?? null)}</p>
          </div>
          <div class="rounded-xl bg-gray-50 p-3">
            <p class="text-gray-400">Prochaine plage</p>
            <p class="font-semibold text-gray-700">{fmtDate(status?.nextWindowAt ?? null)}</p>
          </div>
        </div>
      )}

      {error ? (
        <p class="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}

      <div class="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          class="rounded-full bg-[#175B37] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
          disabled={busyAction !== null}
          onClick={() => void runAction('start')}
        >
          {busyAction === 'start' ? 'Démarrage…' : 'Démarrer maintenant'}
        </button>
        <button
          type="button"
          class="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 disabled:opacity-60"
          disabled={busyAction !== null}
          onClick={() => void runAction('stop')}
        >
          {busyAction === 'stop' ? 'Arrêt…' : 'Arrêter'}
        </button>
        <button
          type="button"
          class="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-700 disabled:opacity-60"
          disabled={busyAction !== null}
          onClick={() => void runAction('schedule')}
        >
          {busyAction === 'schedule' ? 'Activation…' : 'Repasser en planifié'}
        </button>
      </div>
    </section>
  );
}
