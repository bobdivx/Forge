import { useEffect, useState } from 'preact/hooks';

type Entry = { name: string; path: string };

type BrowsePayload = {
  current?: string;
  parent?: string | null;
  entries?: Entry[];
  roots?: boolean;
  error?: string;
};

type Props = {
  open: boolean;
  title: string;
  initialPath: string;
  onClose: () => void;
  onPick: (absPath: string) => void;
};

export default function FolderBrowseModal({ open, title, initialPath, onClose, onPick }: Props) {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [current, setCurrent] = useState('');
  const [parent, setParent] = useState<string | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [rootsMode, setRootsMode] = useState(false);

  const load = async (pathParam: string | null, opts?: { roots?: boolean }) => {
    setLoading(true);
    setErr('');
    try {
      const qs = new URLSearchParams();
      if (opts?.roots) {
        qs.set('roots', '1');
      } else if (pathParam === '__roots__') {
        qs.set('path', '__roots__');
      } else if (pathParam?.trim()) {
        qs.set('path', pathParam.trim());
      }
      const res = await fetch(`/api/fs/browse-directory?${qs.toString()}`);
      const data = (await res.json().catch(() => ({}))) as BrowsePayload;
      if (!res.ok) {
        setErr(data.error || 'Impossible de lire ce dossier');
        return;
      }
      setCurrent(data.current ?? '');
      setParent(data.parent ?? null);
      setEntries(Array.isArray(data.entries) ? data.entries : []);
      setRootsMode(Boolean(data.roots));
    } catch {
      setErr('Erreur réseau');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const seed = initialPath.trim();
    void load(seed || null);
  }, [open, initialPath]);

  if (!open) return null;

  const goUp = () => {
    if (parent === '__roots__') {
      void load(null, { roots: true });
      return;
    }
    if (parent) void load(parent);
  };

  const enter = (p: string) => void load(p);

  const pickCurrent = () => {
    if (rootsMode || !current) return;
    onPick(current);
    onClose();
  };

  return (
    <div
      class="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="folder-browse-title"
    >
      <div class="bg-white rounded-2xl border border-gray-200 shadow-xl max-w-lg w-full max-h-[85vh] flex flex-col">
        <div class="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h2 id="folder-browse-title" class="text-lg font-bold text-gray-900">
              {title}
            </h2>
            <p class="text-[11px] text-gray-500 mt-1 font-mono break-all">{rootsMode ? 'Lecteurs' : current || '—'}</p>
          </div>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
            onClick={onClose}
            aria-label="Fermer"
          >
            ×
          </button>
        </div>

        <div class="px-5 py-3 flex flex-wrap gap-2 border-b border-gray-50">
          <button
            type="button"
            disabled={loading || (rootsMode && parent === null)}
            onClick={goUp}
            class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
          >
            ⬆ Dossier parent
          </button>
          {typeof window !== 'undefined' && window.navigator.userAgent.includes('Win') && !rootsMode && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void load(null, { roots: true })}
              class="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40"
            >
              Lecteurs (Windows)
            </button>
          )}
        </div>

        <div class="flex-1 min-h-0 overflow-y-auto px-3 py-2">
          {loading && <p class="text-sm text-gray-500 px-2 py-6">Chargement…</p>}
          {err && !loading && <p class="text-sm text-red-600 px-2 py-2">{err}</p>}
          {!loading && !err && (
            <ul class="space-y-0.5">
              {entries.map((e) => (
                <li key={e.path}>
                  <button
                    type="button"
                    class="w-full text-left px-3 py-2 rounded-lg text-sm font-mono hover:bg-[#175B37]/10 flex items-center gap-2"
                    onClick={() => enter(e.path)}
                  >
                    <span class="text-gray-400">📁</span>
                    <span class="truncate">{e.name}</span>
                  </button>
                </li>
              ))}
              {entries.length === 0 && !rootsMode && (
                <p class="text-xs text-gray-500 px-2 py-4">Aucun sous-dossier.</p>
              )}
            </ul>
          )}
        </div>

        <div class="px-5 py-4 border-t border-gray-100 flex justify-end gap-2 flex-wrap">
          <button
            type="button"
            class="text-sm font-semibold px-4 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50"
            onClick={onClose}
          >
            Annuler
          </button>
          <button
            type="button"
            disabled={loading || rootsMode || !current}
            class="text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-40"
            style={{ background: '#175B37' }}
            onClick={pickCurrent}
          >
            Utiliser ce dossier
          </button>
        </div>
      </div>
    </div>
  );
}
