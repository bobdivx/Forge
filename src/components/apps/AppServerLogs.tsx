import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

type Props = {
  appName: string;
  serverId: string;
  serverLabel: string;
  onClose: () => void;
};

const LINE_COUNTS = [100, 200, 500];

export default function AppServerLogs({ appName, serverId, serverLabel, onClose }: Props) {
  const [lines, setLines]       = useState<string[]>([]);
  const [exists, setExists]     = useState<boolean | null>(null);
  const [logPath, setLogPath]   = useState<string>('');
  const [error, setError]       = useState<string | null>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [lineCount, setLineCount]   = useState(200);
  const [filter, setFilter]     = useState('');
  const [paused, setPaused]     = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const fetchLogs = useCallback(async () => {
    if (paused) return;
    try {
      const res = await fetch(
        `/api/projects/${encodeURIComponent(appName)}/server-logs` +
        `?serverId=${encodeURIComponent(serverId)}&lines=${lineCount}`
      );
      if (!res.ok) { setError('Erreur chargement logs'); return; }
      const data = await res.json();
      setExists(data.exists);
      setLines(data.lines ?? []);
      setLogPath(data.path ?? '');
      setError(null);
    } catch {
      setError('Erreur réseau');
    }
  }, [appName, serverId, lineCount, paused]);

  useEffect(() => {
    fetchLogs();
    const t = setInterval(fetchLogs, 3000);
    return () => clearInterval(t);
  }, [fetchLogs]);

  useEffect(() => {
    if (autoScroll && bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [lines, autoScroll]);

  // Téléchargement du contenu visible
  const downloadLogs = () => {
    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName}-${serverId}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Lignes filtrées
  const displayLines = filter.trim()
    ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  // Fermeture avec Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      class="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="w-full max-w-5xl bg-gray-950 rounded-2xl shadow-2xl border border-gray-800 flex flex-col"
           style="max-height: min(90vh, 800px)">

        {/* ── Header ────────────────────────────────────────────────── */}
        <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800 gap-3 flex-wrap">
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-green-400">📋</span>
            <span class="text-gray-100 font-semibold text-sm truncate">{serverLabel}</span>
            {logPath && (
              <span class="text-gray-600 font-mono text-[10px] hidden sm:block truncate">
                {logPath}
              </span>
            )}
          </div>
          <div class="flex items-center gap-2 shrink-0">
            {/* Nombre de lignes */}
            <select
              value={lineCount}
              onChange={(e) => setLineCount(parseInt((e.target as HTMLSelectElement).value, 10))}
              class="text-xs bg-gray-900 border border-gray-700 text-gray-300 rounded px-2 py-1"
            >
              {LINE_COUNTS.map((n) => (
                <option key={n} value={n}>{n} lignes</option>
              ))}
            </select>
            {/* Pause */}
            <button
              onClick={() => setPaused((v) => !v)}
              title={paused ? 'Reprendre' : 'Mettre en pause'}
              class={`text-xs px-2 py-1 rounded border transition-colors ${
                paused
                  ? 'border-yellow-600 text-yellow-400 bg-yellow-900/20'
                  : 'border-gray-700 text-gray-400 hover:text-gray-200'
              }`}
            >
              {paused ? '▶ Reprendre' : '⏸ Pause'}
            </button>
            {/* Rafraîchir */}
            <button
              onClick={() => { setPaused(false); fetchLogs(); }}
              title="Rafraîchir"
              class="text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded border border-gray-700"
            >
              ↻
            </button>
            {/* Télécharger */}
            <button
              onClick={downloadLogs}
              title="Télécharger les logs"
              disabled={lines.length === 0}
              class="text-xs text-gray-400 hover:text-gray-200 transition-colors px-2 py-1 rounded border border-gray-700 disabled:opacity-30"
            >
              ⬇ .log
            </button>
            {/* Fermer */}
            <button
              onClick={onClose}
              class="text-gray-400 hover:text-white transition-colors text-lg leading-none ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* ── Barre de filtre ───────────────────────────────────────── */}
        <div class="px-4 py-2 border-b border-gray-800 flex items-center gap-2">
          <span class="text-gray-600 text-xs shrink-0">🔍</span>
          <input
            type="text"
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            placeholder="Filtrer les lignes..."
            class="flex-1 bg-transparent text-gray-300 text-xs outline-none placeholder-gray-600"
          />
          {filter && (
            <button
              onClick={() => setFilter('')}
              class="text-gray-600 hover:text-gray-300 text-xs"
            >
              ✕
            </button>
          )}
          {filter && (
            <span class="text-gray-600 text-[10px] shrink-0">
              {displayLines.length} résultat{displayLines.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* ── Corps : logs ──────────────────────────────────────────── */}
        <div class="flex-1 overflow-y-auto p-4 font-mono text-xs leading-5 select-text">
          {error && (
            <p class="text-red-400 mb-2">{error}</p>
          )}
          {exists === false && !error && (
            <div class="text-gray-500 text-center py-8">
              <p class="text-2xl mb-2">📭</p>
              <p>Aucun fichier de log.</p>
              <p class="text-[10px] mt-1 text-gray-600">Démarrez le serveur pour générer des logs.</p>
            </div>
          )}
          {displayLines.length === 0 && exists && !error && !filter && (
            <p class="text-gray-500">Log vide pour l'instant...</p>
          )}
          {displayLines.length === 0 && filter && (
            <p class="text-gray-600">Aucune ligne ne correspond à « {filter} ».</p>
          )}
          {displayLines.map((line, i) => {
            const lower = line.toLowerCase();
            const isError   = /\berror\b|exception|fatal|traceback|crash|panic/i.test(line);
            const isWarn    = /\bwarn(?:ing)?\b/i.test(line) && !isError;
            const isSuccess = /\bsuccess\b|ready|started|listening|compiled|✓|✔/i.test(line) && !isError && !isWarn;
            const isInfo    = /\binfo\b|\[info\]/i.test(line) && !isError && !isWarn;
            const hasFilter = filter && lower.includes(filter.toLowerCase());

            return (
              <div
                key={i}
                class={`whitespace-pre-wrap break-all px-1 rounded-sm ${
                  hasFilter           ? 'bg-yellow-900/30' :
                  isError             ? 'bg-red-950/30' :
                  ''
                } ${
                  isError   ? 'text-red-400' :
                  isWarn    ? 'text-yellow-400' :
                  isSuccess ? 'text-green-400' :
                  isInfo    ? 'text-blue-400' :
                  'text-gray-300'
                }`}
              >
                {line || '\u00A0'}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* ── Footer ────────────────────────────────────────────────── */}
        <div class="px-4 py-2 border-t border-gray-800 flex items-center justify-between text-[10px] text-gray-600 font-mono">
          <span>
            {displayLines.length} ligne{displayLines.length !== 1 ? 's' : ''}
            {filter ? ` (filtrées sur ${lines.length})` : ''}
            {paused && <span class="text-yellow-600 ml-2">⏸ en pause</span>}
          </span>
          <label class="flex items-center gap-1.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll((e.target as HTMLInputElement).checked)}
              class="rounded"
            />
            Auto-scroll
          </label>
        </div>
      </div>
    </div>
  );
}
