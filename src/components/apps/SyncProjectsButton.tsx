import { useState } from 'preact/hooks';

export default function SyncProjectsButton() {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function sync() {
    setState('loading');
    setMsg('');
    try {
      const r = await fetch('/api/sync-projects', { method: 'POST' });
      const data = await r.json();
      if (data.ok) {
        const added = data.results?.filter((x: { status: string }) => x.status === 'added').length ?? 0;
        const exists = data.results?.filter((x: { status: string }) => x.status === 'exists').length ?? 0;
        setMsg(`${added} ajouté(s), ${exists} déjà présent(s). Rechargez la page.`);
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
        class={`btn btn-sm ${state === 'done' ? 'btn-success' : 'btn-outline'} border-blue-700 text-blue-300 hover:bg-blue-900/30 hover:border-blue-500 disabled:opacity-50`}
      >
        {state === 'loading' ? (
          <span class="flex items-center gap-2"><span class="loading loading-spinner loading-xs" />Scan en cours…</span>
        ) : (
          '⟳ Synchroniser les dépôts Git'
        )}
      </button>
      {msg && (
        <span class={`text-xs px-3 py-1.5 rounded ${state === 'done' ? 'bg-green-900/50 text-green-300' : 'bg-red-900/50 text-red-300'}`}>
          {msg}
        </span>
      )}
    </div>
  );
}
