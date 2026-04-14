import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

type ServerDef = {
  id: string;
  label: string;
  port: number;
  npmScript: string;
  workdir?: string;
};

type Props = {
  appName: string;
  initialServerId?: string;
};

const LINE_COUNTS = [100, 200, 500];

export default function AppLogsPage({ appName, initialServerId }: Props) {
  const [servers, setServers]       = useState<ServerDef[]>([]);
  const [serverId, setServerId]     = useState<string>(initialServerId ?? '');
  const [lines, setLines]           = useState<string[]>([]);
  const [exists, setExists]         = useState<boolean | null>(null);
  const [logPath, setLogPath]       = useState('');
  const [error, setError]           = useState<string | null>(null);
  const [loading, setLoading]       = useState(true);
  const [paused, setPaused]         = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [lineCount, setLineCount]   = useState(200);
  const [filter, setFilter]         = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Chargement de la liste des serveurs
  useEffect(() => {
    fetch(`/api/projects/${encodeURIComponent(appName)}/dashboard-config`)
      .then((r) => r.json())
      .then((data) => {
        const srvs: ServerDef[] = data.config?.servers ?? [];
        setServers(srvs);
        if (!serverId && srvs.length > 0) setServerId(srvs[0].id);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [appName]);

  const fetchLogs = useCallback(async () => {
    if (!serverId || paused) return;
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

  const downloadLogs = () => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${appName}-${serverId}.log`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const displayLines = filter.trim()
    ? lines.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : lines;

  const currentServer = servers.find((s) => s.id === serverId);

  if (loading) {
    return (
      <div class="flex items-center justify-center h-64 text-gray-400 text-sm">
        Chargement...
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div class="flex flex-col items-center justify-center h-64 gap-3 text-gray-400">
        <p class="text-4xl">📭</p>
        <p class="text-sm">Aucun serveur configuré pour ce projet.</p>
        <a
          href={`/apps/${encodeURIComponent(appName)}`}
          class="text-xs text-blue-500 hover:underline"
        >
          Configurer les serveurs →
        </a>
      </div>
    );
  }

  return (
    <div class="flex flex-col h-full min-h-0" style="height: calc(100vh - 160px)">

      {/* ── Barre d'outils ─────────────────────────────────────────── */}
      <div class="bg-gray-950 border-b border-gray-800 px-4 py-3 flex flex-wrap items-center gap-3">

        {/* Sélecteur de serveur */}
        <div class="flex items-center gap-2">
          <span class="text-gray-500 text-xs shrink-0">Serveur</span>
          <div class="flex gap-1">
            {servers.map((s) => (
              <button
                key={s.id}
                onClick={() => setServerId(s.id)}
                class={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                  s.id === serverId
                    ? 'border-green-600 bg-green-900/30 text-green-300'
                    : 'border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500'
                }`}
              >
                {s.label}
                {s.workdir && (
                  <span class="ml-1 text-[9px] opacity-60">📁{s.workdir}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div class="flex items-center gap-2 ml-auto flex-wrap">
          {/* Nb lignes */}
          <select
            value={lineCount}
            onChange={(e) => setLineCount(parseInt((e.target as HTMLSelectElement).value, 10))}
            class="text-xs bg-gray-900 border border-gray-700 text-gray-300 rounded px-2 py-1"
          >
            {LINE_COUNTS.map((n) => (
              <option key={n} value={n}>{n} lignes</option>
            ))}
          </select>

          {/* Pause / reprendre */}
          <button
            onClick={() => setPaused((v) => !v)}
            class={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
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
            class="text-xs text-gray-400 hover:text-gray-200 px-2 py-1.5 rounded-full border border-gray-700"
          >
            ↻
          </button>

          {/* Télécharger */}
          <button
            onClick={downloadLogs}
            disabled={lines.length === 0}
            class="text-xs text-gray-400 hover:text-gray-200 px-3 py-1.5 rounded-full border border-gray-700 disabled:opacity-30"
          >
            ⬇ Télécharger
          </button>
        </div>
      </div>

      {/* Chemin du fichier + filtre */}
      <div class="bg-gray-950 border-b border-gray-800 px-4 py-2 flex items-center gap-3">
        {logPath && (
          <span class="text-gray-600 font-mono text-[10px] truncate hidden sm:block shrink-0 max-w-[300px]">
            {logPath}
          </span>
        )}
        <div class="flex items-center gap-2 flex-1">
          <span class="text-gray-600 text-xs">🔍</span>
          <input
            type="text"
            value={filter}
            onInput={(e) => setFilter((e.target as HTMLInputElement).value)}
            placeholder="Filtrer..."
            class="flex-1 bg-transparent text-gray-300 text-xs outline-none placeholder-gray-600"
          />
          {filter && (
            <>
              <span class="text-gray-600 text-[10px]">
                {displayLines.length}/{lines.length}
              </span>
              <button onClick={() => setFilter('')} class="text-gray-600 hover:text-gray-300 text-xs">✕</button>
            </>
          )}
        </div>
        {paused && (
          <span class="text-yellow-600 text-[10px] font-mono shrink-0">⏸ en pause</span>
        )}
      </div>

      {/* ── Corps des logs ─────────────────────────────────────────── */}
      <div class="flex-1 overflow-y-auto bg-gray-950 p-4 font-mono text-xs leading-5 select-text">
        {error && <p class="text-red-400 mb-2">{error}</p>}

        {exists === false && !error && (
          <div class="text-gray-500 text-center py-16">
            <p class="text-3xl mb-3">📭</p>
            <p>Aucun fichier de log.</p>
            <p class="text-[10px] mt-1 text-gray-600">Démarrez le serveur pour générer des logs.</p>
            <a
              href={`/apps/${encodeURIComponent(appName)}`}
              class="mt-4 inline-block text-xs text-blue-500 hover:underline"
            >
              Gérer les serveurs →
            </a>
          </div>
        )}

        {displayLines.length === 0 && exists && !error && !filter && (
          <p class="text-gray-600 italic">Log vide pour l'instant...</p>
        )}

        {displayLines.map((line, i) => {
          const isError   = /\berror\b|exception|fatal|traceback|crash|panic/i.test(line);
          const isWarn    = /\bwarn(?:ing)?\b/i.test(line) && !isError;
          const isSuccess = /\bsuccess\b|ready|started|listening|compiled|✓|✔/i.test(line) && !isError && !isWarn;
          const isInfo    = /\binfo\b|\[info\]/i.test(line) && !isError && !isWarn;
          const hasFilter = filter && line.toLowerCase().includes(filter.toLowerCase());

          return (
            <div
              key={i}
              class={`whitespace-pre-wrap break-all px-1 rounded-sm ${
                hasFilter ? 'bg-yellow-900/30' : isError ? 'bg-red-950/30' : ''
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

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div class="bg-gray-950 border-t border-gray-800 px-4 py-2 flex items-center justify-between text-[10px] text-gray-600 font-mono">
        <span>
          {displayLines.length} ligne{displayLines.length !== 1 ? 's' : ''}
          {filter ? ` filtrées sur ${lines.length}` : ''}
        </span>
        <label class="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll((e.target as HTMLInputElement).checked)}
          />
          Auto-scroll
        </label>
      </div>
    </div>
  );
}
