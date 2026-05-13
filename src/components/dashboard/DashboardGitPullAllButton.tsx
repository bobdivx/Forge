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
    <div class="flex flex-col gap-2">
      <div class="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          class="btn btn-sm btn-outline border-emerald-700 text-emerald-200 hover:bg-emerald-900/30 hover:border-emerald-500"
        >
          ↓ Mettre à jour depuis GitHub (tous les projets)
        </button>
        {open && (
          <div class="flex flex-col gap-2 rounded-xl border border-gray-600 bg-gray-900/80 p-4 text-sm text-gray-200 max-w-lg">
            <p class="text-xs text-gray-400">
              Exécute <code class="text-emerald-300">git pull origin &lt;branche courante&gt;</code> pour chaque
              dépôt. Les projets sans Git ou avec HEAD détachée sont ignorés ou signalés.
            </p>
            <fieldset class="space-y-2">
              <label class="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="dirty"
                  checked={strategy === 'skip'}
                  onChange={() => setStrategy('skip')}
                  class="mt-1"
                />
                <span>
                  <strong class="text-gray-100">Ignorer</strong> les dépôts avec des modifications locales non
                  commitées (liste fournie ensuite).
                </span>
              </label>
              <label class="flex cursor-pointer items-start gap-2">
                <input
                  type="radio"
                  name="dirty"
                  checked={strategy === 'stash'}
                  onChange={() => setStrategy('stash')}
                  class="mt-1"
                />
                <span>
                  <strong class="text-gray-100">Mettre de côté (stash)</strong> les fichiers locaux y compris non
                  suivis, puis tirer depuis GitHub et réappliquer le stash.
                </span>
              </label>
            </fieldset>
            <div class="flex gap-2 pt-1">
              <button
                type="button"
                onClick={run}
                disabled={state === 'loading'}
                class="btn btn-sm btn-primary"
              >
                {state === 'loading' ? (
                  <span class="flex items-center gap-2">
                    <span class="loading loading-spinner loading-xs" />
                    Mise à jour…
                  </span>
                ) : (
                  'Lancer'
                )}
              </button>
              <button type="button" class="btn btn-sm btn-ghost" onClick={() => setOpen(false)}>
                Annuler
              </button>
            </div>
          </div>
        )}
      </div>

      {summary && state !== 'idle' && state !== 'loading' && (
        <div
          class={`text-xs px-3 py-2 rounded-lg max-w-3xl ${
            state === 'done' ? 'bg-emerald-900/40 text-emerald-200' : 'bg-amber-900/40 text-amber-100'
          }`}
        >
          <p>
            {summary.total} dépôt(s) examiné(s) — {summary.pulled} mis à jour, {summary.skippedDirty} ignoré(s) (modifs
            locales), {summary.failed} échec(s).
          </p>
        </div>
      )}

      {data?.error && !summary && (
        <span class="text-xs px-3 py-2 rounded-lg bg-red-900/50 text-red-200 max-w-xl">{data.error}</span>
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
