import { useEffect, useRef, useState } from 'preact/hooks';

type Entry = {
  id: number;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  createdAt: string;
};

type AutonomyMode = 'on' | 'off' | 'quiet_hours';

type AutonomyStatus = {
  ok: boolean;
  mode: AutonomyMode;
  quietHours: string;
  inQuietHours: boolean;
  subDaemons: Array<{ name: string; running: boolean; lastError: string | null; lastTickAt: string | null }>;
  bootedAt: string | null;
};

const MAX_ENTRIES = 200;

function actorBadge(actorType: string) {
  switch (actorType) {
    case 'agent':
      return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
    case 'user':
      return 'bg-blue-50 text-blue-700 border border-blue-100';
    case 'system':
      return 'bg-purple-50 text-purple-700 border border-purple-100';
    default:
      return 'bg-gray-50 text-gray-600 border border-gray-100';
  }
}

export default function ActivityLive() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [autonomy, setAutonomy] = useState<AutonomyStatus | null>(null);
  const [connected, setConnected] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const fetchAutonomy = async () => {
    try {
      const res = await fetch('/api/autonomy/status');
      const data = (await res.json()) as AutonomyStatus;
      setAutonomy(data);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchAutonomy();
    const id = setInterval(fetchAutonomy, 20_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const es = new EventSource('/api/forge-activity-stream');
    es.addEventListener('activity', (ev) => {
      try {
        const entry = JSON.parse((ev as MessageEvent).data) as Entry;
        setEntries((prev) => {
          const next = [...prev, entry];
          return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
        });
      } catch {
        /* ignore */
      }
    });
    es.addEventListener('ping', () => setConnected(true));
    es.addEventListener('error', () => setConnected(false));
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    return () => es.close();
  }, []);

  useEffect(() => {
    if (autoScroll && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  const switchMode = async (mode: AutonomyMode) => {
    await fetch('/api/autonomy/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode }),
    });
    await fetchAutonomy();
  };

  return (
    <div class="rounded-[1.5rem] bg-white border border-gray-100 shadow-sm p-5">
      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <span class="text-[10px] font-black uppercase tracking-widest text-[#175B37]">Activity Live</span>
          <h2 class="text-base font-bold text-gray-900 mt-1">Forge en autonomie</h2>
          <p class="text-xs text-gray-500 mt-1 leading-relaxed">
            Flux temps-réel des actions agents et daemons.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
            connected ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'
          }`}>
            <span class={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            {connected ? 'SSE' : 'Hors-ligne'}
          </span>
          <select
            value={autonomy?.mode ?? 'on'}
            onChange={(e) => switchMode((e.target as HTMLSelectElement).value as AutonomyMode)}
            class="text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-full px-2.5 py-1 bg-white hover:border-[#175B37]/35 transition-colors focus:outline-none"
            title="Mode d'autonomie"
          >
            <option value="on">Actif</option>
            <option value="quiet_hours">Heures calmes</option>
            <option value="off">Inactif</option>
          </select>
        </div>
      </div>

      {autonomy && (
        <div class="mb-4 flex flex-wrap gap-2 text-[10px]">
          {autonomy.subDaemons.map((d) => (
            <span
              key={d.name}
              class={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg border font-medium ${
                d.running
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100'
                  : 'bg-gray-50 text-gray-500 border-gray-100'
              }`}
              title={d.lastError ?? undefined}
            >
              <span class={`h-1.5 w-1.5 rounded-full ${d.running ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              {d.name}
            </span>
          ))}
          {autonomy.inQuietHours && (
            <span class="px-2 py-0.5 rounded-lg border bg-amber-50 text-amber-700 border-amber-100 font-medium">
              Heures calmes ({autonomy.quietHours})
            </span>
          )}
        </div>
      )}

      <div
        ref={containerRef as never}
        class="bg-gray-50/50 border border-gray-100 rounded-2xl p-4 h-[350px] overflow-y-auto custom-scrollbar flex flex-col gap-3"
        onScroll={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          const atBottom = el.scrollTop + el.clientHeight + 20 >= el.scrollHeight;
          setAutoScroll(atBottom);
        }}
      >
        {entries.length === 0 ? (
          <div class="text-gray-400 text-center py-12 text-xs font-medium">En attente d'événements…</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} class="flex items-start gap-3 relative pb-1 last:pb-0 border-l border-gray-200 pl-4 ml-2">
              <div class={`absolute left-0 top-1.5 -translate-x-1/2 w-2 h-2 rounded-full border border-white ${
                e.actorType === 'agent'
                  ? 'bg-emerald-500'
                  : e.actorType === 'user'
                  ? 'bg-blue-500'
                  : 'bg-purple-500'
              }`} />
              
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <span class="text-[10px] text-gray-400 font-semibold">{new Date(e.createdAt).toLocaleTimeString()}</span>
                  <span class={`px-1 rounded text-[8px] uppercase font-bold tracking-wider ${actorBadge(e.actorType)}`}>
                    {e.actorId}
                  </span>
                </div>
                <div class="text-xs text-gray-800 font-bold leading-normal">
                  <span class="text-[#175B37]">{e.action}</span>
                </div>
                {e.entityType && (
                  <div class="text-[9px] text-gray-500 mt-0.5 truncate font-mono bg-white border border-gray-100 px-1 py-0.5 rounded inline-block">
                    {e.entityType}/{e.entityId}
                  </div>
                )}
                {e.details && (
                  <div class="text-[10px] text-gray-500 mt-1 max-w-full truncate whitespace-normal line-clamp-2 leading-relaxed">
                    {typeof e.details === 'string' && e.details.startsWith('{')
                      ? 'Détails JSON...'
                      : e.details}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
      {!autoScroll && (
        <button
          class="mt-3 w-full flex items-center justify-center gap-1.5 py-2 border border-[#175B37]/15 bg-[#E9F3EB]/40 text-[#175B37] text-xs font-bold rounded-xl hover:bg-[#E9F3EB]/80 transition-colors"
          onClick={() => {
            setAutoScroll(true);
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
          }}
        >
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 13l-7 7-7-7m14-6l-7 7-7-7" />
          </svg>
          Reprendre le défilement
        </button>
      )}
    </div>
  );
}
