import { useEffect, useState } from 'preact/hooks';

type Status = {
  running: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunSuggestions: number;
  lastRunError: string | null;
  nextRunAt: string | null;
};

type Suggestion = {
  id: number;
  projectId: number | null;
  kind: string;
  packageName: string | null;
  currentVersion: string | null;
  latestVersion: string | null;
  severity: string | null;
  impact: string;
  title: string;
  detail: string | null;
  status: string;
  requestId: number | null;
  createdAt: string;
};

const REFRESH_MS = 30_000;

function impactBadge(impact: string) {
  switch (impact) {
    case 'critical':
      return 'bg-rose-50 text-rose-700 border-rose-200';
    case 'high':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'medium':
      return 'bg-amber-50 text-amber-800 border-amber-200';
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200';
  }
}

function kindLabel(kind: string) {
  if (kind === 'outdated') return 'Dépendance obsolète';
  if (kind === 'advisory') return 'Advisory sécurité';
  if (kind === 'rss') return 'Veille (RSS)';
  return kind;
}

export default function VeilleTechBoard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [recent, setRecent] = useState<Suggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [filter, setFilter] = useState<'all' | 'high' | 'critical' | 'open'>('all');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/agents/veille/status');
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
      const res = await fetch('/api/agents/veille/run-now', { method: 'POST' });
      const data = await res.json();
      setMessage(data.ok ? `Run terminé (${data.suggestions} suggestions).` : `Échec : ${data.error || 'inconnu'}`);
      await fetchStatus();
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const filtered = recent.filter((s) => {
    if (filter === 'all') return true;
    if (filter === 'open') return s.status === 'open' || s.status === 'converted_to_request';
    return s.impact === filter;
  });

  return (
    <div class="space-y-6">
      <header class="rounded-[1.5rem] bg-white border border-gray-100 shadow-sm p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <span class="text-[10px] font-black uppercase tracking-widest text-[#175B37]">Veille tech</span>
            <h1 class="text-xl font-bold text-gray-900 mt-1">Agent de Veille Technologique</h1>
            <p class="text-sm text-gray-500 mt-1 max-w-2xl">
              Scanne les dépendances obsolètes, les advisories sécurité (npm audit) et les flux configurés.
              Propose des améliorations et crée des tâches dans le carnet quand l'impact est élevé.
            </p>
          </div>
          <button
            onClick={runNow}
            disabled={busy}
            class="rounded-full bg-[#175B37] px-5 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {busy ? 'Run en cours…' : 'Lancer un scan maintenant'}
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
          <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Intervalle</span>
          <span class="text-2xl font-bold text-gray-900">{status?.intervalMinutes ?? '—'}</span>
          <span class="text-xs text-gray-400 block mt-1">minutes entre scans</span>
        </div>
        <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
          <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Dernier scan</span>
          <span class="text-2xl font-bold text-gray-900">{status?.lastRunSuggestions ?? 0}</span>
          <span class="text-xs text-gray-400 block mt-1">suggestions ajoutées</span>
        </div>
        <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
          <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Prochain run</span>
          <span class="text-xs font-mono text-gray-900">{status?.nextRunAt ? new Date(status.nextRunAt).toLocaleString() : '—'}</span>
          {status?.lastRunError && (
            <div class="text-[10px] text-rose-600 mt-2 truncate" title={status.lastRunError}>
              Erreur : {status.lastRunError}
            </div>
          )}
        </div>
      </section>

      <section class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-sm font-bold text-gray-900">Suggestions récentes</h2>
          <div class="flex gap-2 text-[11px]">
            {(['all', 'critical', 'high', 'open'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                class={`px-3 py-1 rounded-full font-bold transition-colors ${
                  filter === f
                    ? 'bg-[#175B37] text-white'
                    : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {f === 'all' ? 'Toutes' : f === 'critical' ? 'Critiques' : f === 'high' ? 'Élevées' : 'Ouvertes'}
              </button>
            ))}
          </div>
        </div>
        {filtered.length === 0 ? (
          <div class="text-center text-xs text-gray-500 py-8">
            Aucune suggestion {filter !== 'all' ? `(${filter})` : ''} pour l'instant.
          </div>
        ) : (
          <ul class="space-y-2">
            {filtered.map((s) => (
              <li key={s.id} class="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class={`text-[10px] font-bold px-2 py-0.5 rounded border ${impactBadge(s.impact)}`}>
                        {s.impact.toUpperCase()}
                      </span>
                      <span class="text-[10px] font-bold uppercase text-gray-500">{kindLabel(s.kind)}</span>
                      {s.requestId && (
                        <span class="text-[10px] font-bold text-emerald-700">→ Carnet #{s.requestId}</span>
                      )}
                    </div>
                    <div class="text-sm font-semibold text-gray-900 truncate">{s.title}</div>
                    {s.detail && <div class="text-xs text-gray-500 mt-1 line-clamp-2">{s.detail}</div>}
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
