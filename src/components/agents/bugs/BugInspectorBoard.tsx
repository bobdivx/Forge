import { useEffect, useState } from 'preact/hooks';

type Status = {
  running: boolean;
  intervalMs: number;
  lastScanAt: string | null;
  lastScanDurationMs: number | null;
  lastScanError: string | null;
  lastScanBugsDetected: number;
};

type Issue = {
  id: number;
  projectId: number | null;
  url: string;
  errorType: string;
  title: string;
  detail: string | null;
  status: string;
  reportedByAgentId: string | null;
  createdAt: string;
};

const REFRESH_MS = 20_000;

function statusBadge(status: string) {
  switch (status) {
    case 'open':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'in_progress':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'fixed':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'ignored':
      return 'bg-gray-100 text-gray-500 border-gray-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

export default function BugInspectorBoard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [recent, setRecent] = useState<Issue[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'fixed'>('all');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/agents/bugs/status');
      const data = await res.json();
      setStatus(data.status);
      setRecent(Array.isArray(data.recent) ? data.recent : []);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const runNow = async () => {
    setBusy(true);
    setMessage('');
    try {
      const res = await fetch('/api/agents/bugs/run-now', { method: 'POST' });
      const data = await res.json();
      setMessage(data.ok ? `Scan terminé (${data.bugsDetected} bugs détectés en ${data.durationMs} ms).` : `Échec : ${data.error || 'inconnu'}`);
      await fetchStatus();
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const filtered = recent.filter((s) => filter === 'all' || s.status === filter);

  return (
    <div class="space-y-6">
      <header class="rounded-[1.5rem] bg-white border border-gray-100 shadow-sm p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <span class="text-[10px] font-black uppercase tracking-widest text-[#175B37]">Bug Inspector</span>
            <h1 class="text-xl font-bold text-gray-900 mt-1">Détecteur de bugs</h1>
            <p class="text-sm text-gray-500 mt-1 max-w-2xl">
              Scanne en continu les logs des serveurs de développement, détecte les erreurs, et crée des tickets
              automatiquement. Les bugs bloquants sont escaladés en tâches dans le carnet.
            </p>
          </div>
          <button
            onClick={runNow}
            disabled={busy}
            class="rounded-full bg-[#175B37] px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Scan en cours…' : 'Forcer un scan'}
          </button>
        </div>
        {message && <div class="mt-3 text-xs text-emerald-700">{message}</div>}
      </header>

      <section class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
          <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Statut</span>
          <span class={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold ${
            status?.running
              ? 'bg-blue-50 text-blue-700 border border-blue-200'
              : 'bg-gray-50 text-gray-600 border border-gray-200'
          }`}>
            <span class={`h-2 w-2 rounded-full ${status?.running ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`} />
            {status?.running ? 'Daemon actif' : 'En attente'}
          </span>
        </div>
        <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
          <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Fréquence</span>
          <span class="text-2xl font-bold text-gray-900">{status ? Math.round(status.intervalMs / 1000) : '—'}</span>
          <span class="text-xs text-gray-400 block mt-1">secondes</span>
        </div>
        <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
          <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Dernier scan</span>
          <span class="text-2xl font-bold text-gray-900">{status?.lastScanBugsDetected ?? 0}</span>
          <span class="text-xs text-gray-400 block mt-1">bugs détectés</span>
        </div>
        <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
          <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Dernier passage</span>
          <span class="text-xs font-mono text-gray-900">
            {status?.lastScanAt ? new Date(status.lastScanAt).toLocaleString() : '—'}
          </span>
          {status?.lastScanError && (
            <div class="text-[10px] text-rose-600 mt-2 truncate" title={status.lastScanError}>
              Erreur : {status.lastScanError}
            </div>
          )}
        </div>
      </section>

      <section class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-bold text-gray-900">Incidents récents</h2>
          <div class="flex gap-2 text-[11px]">
            {(['all', 'open', 'in_progress', 'fixed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                class={`px-3 py-1 rounded-full font-bold transition-colors ${
                  filter === f
                    ? 'bg-[#175B37] text-white'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {f === 'all' ? 'Tous' : f === 'open' ? 'Ouverts' : f === 'in_progress' ? 'En cours' : 'Résolus'}
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div class="text-center text-xs text-gray-500 py-8">Aucun incident pour ce filtre.</div>
        ) : (
          <ul class="space-y-2">
            {filtered.map((s) => (
              <li key={s.id} class="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class={`text-[10px] font-bold px-2 py-0.5 rounded border ${statusBadge(s.status)}`}>
                        {s.status.toUpperCase()}
                      </span>
                      <span class="text-[10px] font-bold uppercase text-gray-500">{s.errorType}</span>
                    </div>
                    <div class="text-sm font-semibold text-gray-900 truncate">{s.title}</div>
                    {s.detail && (
                      <pre class="text-[10px] text-gray-500 mt-1 line-clamp-3 font-mono bg-gray-50 p-2 rounded overflow-hidden">
                        {s.detail.slice(0, 400)}
                      </pre>
                    )}
                  </div>
                  <div class="text-[10px] text-gray-400 whitespace-nowrap">
                    {new Date(s.createdAt).toLocaleString()}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
