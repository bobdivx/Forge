import { useState } from 'preact/hooks';

type Strategy = 'skip' | 'stash';

type ResultItem = {
  slug: string;
  name: string;
  ok: boolean;
  skipped?: string;
  dirty?: boolean;
  branch?: string | null;
  error?: string;
  stderr?: string;
  stashPopDetail?: string;
};

type ApiResponse = {
  ok?: boolean;
  error?: string;
  dirtyStrategy?: string;
  summary?: { total: number; pulled: number; skippedDirty: number; failed: number };
  results?: ResultItem[];
};

export default function DashboardGitPullAllButton() {
  const [open, setOpen] = useState(false);
  const [strategy, setStrategy] = useState<Strategy>('skip');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [data, setData] = useState<ApiResponse | null>(null);

  async function run() {
    setState('loading');
    setData(null);
    try {
      const r = await fetch('/api/dashboard-git-pull-all', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ dirtyStrategy: strategy }),
      });
      const raw = await r.text();
      let parsed: ApiResponse = {};
      try {
        parsed = raw ? JSON.parse(raw) : {};
      } catch {
        parsed = {};
      }
      if (!r.ok) {
        setData({ ok: false, error: parsed.error || raw.slice(0, 240) || `HTTP ${r.status}` });
        setState('error');
        return;
      }
      setData(parsed);
      setState(parsed.ok ? 'done' : 'error');
      setOpen(false);
    } catch {
      setData({ ok: false, error: 'Erreur réseau' });
      setState('error');
    }
  }

  const summary = data?.summary;
  const results = data?.results ?? [];

  return (
    <div class="flex flex-col gap-2 relative">
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          class={`flex items-center gap-2 border text-sm font-semibold px-4 py-2.5 rounded-xl shadow-sm transition-all ${
            open
              ? 'border-[#175B37] bg-[#E9F3EB] text-[#175B37]'
              : 'bg-white text-gray-700 border-gray-200 hover:border-[#175B37]/50 hover:bg-[#E9F3EB] hover:text-[#175B37]'
          }`}
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Mettre à jour depuis GitHub (tous)</span>
        </button>
        {open && (
          <div class="absolute top-full left-0 mt-2 z-30 flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-700 shadow-xl w-80 max-w-sm pointer-events-auto">
            <p class="text-xs text-gray-500 leading-relaxed">
              Exécute <code class="text-[#175B37] bg-gray-50 px-1 py-0.5 rounded font-mono">git pull origin &lt;branche&gt;</code> pour chaque dépôt. Les projets sans Git ou avec HEAD détachée sont ignorés.
            </p>
            <fieldset class="space-y-2 border-t border-gray-100 pt-3">
              <label class="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="dirty"
                  checked={strategy === 'skip'}
                  onChange={() => setStrategy('skip')}
                  class="mt-0.5 text-[#175B37] focus:ring-[#175B37]"
                />
                <span>
                  <strong class="text-gray-900">Ignorer</strong> les dépôts avec modifications locales.
                </span>
              </label>
              <label class="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="radio"
                  name="dirty"
                  checked={strategy === 'stash'}
                  onChange={() => setStrategy('stash')}
                  class="mt-0.5 text-[#175B37] focus:ring-[#175B37]"
                />
                <span>
                  <strong class="text-gray-900">Stash & Pull</strong>: met de côté, pull, puis réapplique les modifs.
                </span>
              </label>
            </fieldset>
            <div class="flex items-center gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={run}
                disabled={state === 'loading'}
                class="flex-1 bg-[#175B37] text-white py-2 rounded-lg text-xs font-bold hover:bg-[#134d2e] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                {state === 'loading' ? (
                  <>
                    <span class="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Tirage...
                  </>
                ) : (
                  'Lancer la mise à jour'
                )}
              </button>
              <button type="button" class="px-3 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors" onClick={() => setOpen(false)}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {summary && state !== 'idle' && state !== 'loading' && (
        <div
          class={`text-xs px-3 py-2 rounded-xl max-w-3xl border font-medium ${
            state === 'done' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700'
          }`}
        >
          <p>
            {summary.total} dépôt(s) examiné(s) — {summary.pulled} mis à jour, {summary.skippedDirty} ignoré(s) (modifs locales), {summary.failed} échec(s).
          </p>
        </div>
      )}

      {data?.error && !summary && (
        <span class="text-xs px-3 py-2 rounded-xl bg-rose-50 border border-rose-100 text-rose-700 max-w-xl font-medium">{data.error}</span>
      )}

      {results.length > 0 && state !== 'loading' && (
        <ul class="text-xs space-y-1 max-w-3xl max-h-48 overflow-y-auto rounded-lg bg-black/30 p-3 border border-gray-700">
          {results.map((row) => (
            <li key={row.slug} class="flex flex-wrap gap-x-2 gap-y-0.5 border-b border-gray-800/80 pb-1 last:border-0">
              <a href={`/apps/${encodeURIComponent(row.slug)}`} class="font-medium text-emerald-400 hover:underline">
                {row.name}
              </a>
              {!row.ok && row.skipped === 'not_git' && (
                <span class="text-gray-500">pas de dépôt Git</span>
              )}
              {!row.ok && row.skipped === 'no_path' && <span class="text-gray-500">chemin introuvable</span>}
              {!row.ok && row.skipped === 'invalid_branch' && (
                <span class="text-amber-300">branche / HEAD</span>
              )}
              {!row.ok && !row.skipped && <span class="text-red-400">échec</span>}
              {row.ok && row.skipped === 'dirty' && (
                <span class="text-amber-300">ignoré (modifs locales)</span>
              )}
              {row.ok && !row.skipped && <span class="text-emerald-400/90">OK</span>}
              {row.branch && <span class="text-gray-500">({row.branch})</span>}
              {row.error && <span class="text-red-300/90 block w-full truncate">{row.error}</span>}
              {row.stashPopDetail && (
                <span class="text-amber-200/90 block w-full truncate">{row.stashPopDetail}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
