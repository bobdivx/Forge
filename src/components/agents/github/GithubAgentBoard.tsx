import { useEffect, useState } from 'preact/hooks';
import PRWatchPanel from './PRWatchPanel';
import IssueTriagePanel from './IssueTriagePanel';

type Status = {
  running: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunPrCount: number;
  lastRunError: string | null;
  nextRunAt: string | null;
};

type Decision = {
  id: number;
  projectId: number;
  prNumber: number;
  prTitle: string | null;
  prAuthor: string | null;
  decision: string;
  justification: string | null;
  requestId: number | null;
  provider: string;
  createdAt: string;
};

const REFRESH_MS = 30_000;

export default function GithubAgentBoard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [recent, setRecent] = useState<Decision[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/agents/github/status');
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
      const res = await fetch('/api/agents/github/run-now', { method: 'POST' });
      const data = await res.json();
      setMessage(data.ok ? `Run terminé (${data.prCount} PR analysées).` : `Échec : ${data.error || 'inconnu'}`);
      await fetchStatus();
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(''), 5000);
    }
  };

  const isRunningNow = status && status.lastRunAt && (Date.now() - new Date(status.lastRunAt).getTime() < 60_000);

  return (
    <div class="space-y-6">
      <header class="rounded-[1.5rem] bg-white border border-gray-100 shadow-sm p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <span class="text-[10px] font-black uppercase tracking-widest text-[#175B37]">Agent GitHub</span>
            <h1 class="text-xl font-bold text-gray-900 mt-1">Watcher GitHub Forge</h1>
            <p class="text-sm text-gray-500 mt-1 max-w-2xl">
              Surveille les Pull Requests entrantes sur tous les projets enregistrés, classe chaque PR
              (utile / doublon / déjà fait / besoin d'info) et crée des tâches dans le carnet quand c'est utile.
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
              : isRunningNow
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-gray-50 text-gray-600 border border-gray-200'
          }`}>
            <span class={`h-2 w-2 rounded-full ${status?.running ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`} />
            {status?.running ? 'En cours' : isRunningNow ? 'Dernier scan OK' : 'Veille'}
          </span>
        </div>
        <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
          <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Intervalle</span>
          <span class="text-2xl font-bold text-gray-900">{status?.intervalMinutes ?? '—'}</span>
          <span class="text-xs text-gray-400 block mt-1">minutes entre scans</span>
        </div>
        <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
          <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Dernier scan</span>
          <span class="text-2xl font-bold text-gray-900">{status?.lastRunPrCount ?? 0}</span>
          <span class="text-xs text-gray-400 block mt-1">PR analysées</span>
        </div>
        <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
          <span class="text-[10px] font-black uppercase tracking-widest text-gray-400 block mb-2">Prochain run</span>
          <span class="text-xs font-mono text-gray-900">{status?.nextRunAt ? new Date(status.nextRunAt).toLocaleTimeString() : '—'}</span>
          {status?.lastRunError && (
            <div class="text-[10px] text-rose-600 mt-2 truncate" title={status.lastRunError}>
              Erreur : {status.lastRunError}
            </div>
          )}
        </div>
      </section>

      <PRWatchPanel decisions={recent} onReanalyze={fetchStatus} />

      <IssueTriagePanel />
    </div>
  );
}
