import { useState } from 'preact/hooks';

export default function SyncProjectsButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function sync() {
    setState('loading');
    setMsg('');
    try {
      // Astro `checkOrigin` : un POST sans Content-Type est rejeté (403) si Origin est absent
      // ou ne colle pas à l’URL côté serveur (proxy, IP vs hostname). JSON évite ce garde-fou.
      const r = await fetch('/api/sync-projects', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: '{}',
      });
      const raw = await r.text();
      let data: { ok?: boolean; error?: string; results?: { status: string }[] } = {};
      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = {};
      }
      if (!r.ok) {
        const detail =
          typeof data.error === 'string' && data.error ? data.error : raw.slice(0, 200) || r.statusText;
        setMsg(`HTTP ${r.status} — ${detail}`);
        setState('error');
        return;
      }
      if (data.ok) {
        const added = data.results?.filter((x: { status: string }) => x.status === 'added').length ?? 0;
        const updated =
          data.results?.filter((x: { status: string }) => x.status === 'path_updated').length ?? 0;
        const exists = data.results?.filter((x: { status: string }) => x.status === 'exists').length ?? 0;
        setMsg(
          `${added} ajouté(s), ${updated} chemin(s) mis à jour, ${exists} inchangé(s). Rechargez la page.`,
        );
        setState('done');
      } else {
        setMsg(data.error ?? 'Erreur inconnue');
        setState('error');
      }
    } catch {
      setMsg('Erreur réseau');
      setState('error');
    }
  }

  return (
    <div class="flex items-center gap-3 flex-wrap">
      <button
        onClick={sync}
        disabled={state === 'loading'}
        class={`flex items-center gap-2 border text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed ${
          state === 'done'
            ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
            : state === 'error'
            ? 'border-rose-300 bg-rose-50 text-rose-800'
            : 'bg-white text-gray-700 border-gray-200 hover:border-[#175B37]/50 hover:bg-[#E9F3EB] hover:text-[#175B37]'
        }`}
      >
        <svg class={`w-4 h-4 shrink-0 ${state === 'loading' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span>{state === 'loading' ? 'Scan en cours…' : 'Synchroniser les applications'}</span>
      </button>
      {msg && (
        <span class={`text-xs px-3 py-1.5 rounded-xl border font-medium ${state === 'done' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
          {msg}
        </span>
      )}
    </div>
  );
}
