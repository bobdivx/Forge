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
      return 'bg-emerald-100 text-emerald-800';
    case 'user':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-700';
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
          <p class="text-xs text-gray-500 mt-1">
            Flux temps-réel des actions agents et daemons. Auto-actualisation toutes les 2 s.
          </p>
        </div>
        <div class="flex items-center gap-2">
          <span class={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
            connected ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
          }`}>
            <span class={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            {connected ? 'SSE connecté' : 'SSE déconnecté'}
          </span>
          <select
            value={autonomy?.mode ?? 'on'}
            onChange={(e) => switchMode((e.target as HTMLSelectElement).value as AutonomyMode)}
            class="text-[11px] border border-gray-200 rounded-full px-2 py-1"
            title="Mode d'autonomie"
          >
            <option value="on">24/7</option>
            <option value="quiet_hours">Quiet hours</option>
            <option value="off">Off</option>
          </select>
        </div>
      </div>

      {autonomy && (
        <div class="mb-3 flex flex-wrap gap-2 text-[10px]">
          {autonomy.subDaemons.map((d) => (
            <span
              key={d.name}
              class={`inline-flex items-center gap-1 px-2 py-0.5 rounded border ${
                d.running
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-gray-50 text-gray-600 border-gray-200'
              }`}
              title={d.lastError ?? undefined}
            >
              <span class={`h-1.5 w-1.5 rounded-full ${d.running ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              {d.name}
            </span>
          ))}
          {autonomy.inQuietHours && (
            <span class="px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
              Quiet hours actif ({autonomy.quietHours})
            </span>
          )}
        </div>
      )}

      <div
        ref={containerRef as never}
        class="bg-gray-950 text-gray-200 font-mono text-[11px] rounded-lg p-3 h-[300px] overflow-auto"
        onScroll={(e) => {
          const el = e.currentTarget as HTMLDivElement;
          const atBottom = el.scrollTop + el.clientHeight + 20 >= el.scrollHeight;
          setAutoScroll(atBottom);
        }}
      >
        {entries.length === 0 ? (
          <div class="text-gray-500 text-center py-8">En attente d'événements…</div>
        ) : (
          entries.map((e) => (
            <div key={e.id} class="flex gap-2 py-0.5">
              <span class="text-gray-500 shrink-0">{new Date(e.createdAt).toLocaleTimeString()}</span>
              <span class={`shrink-0 px-1.5 rounded text-[9px] uppercase font-bold ${actorBadge(e.actorType)}`}>
                {e.actorId}
              </span>
              <span class="text-emerald-400 shrink-0">{e.action}</span>
              <span class="text-gray-400 truncate">
                {e.entityType}/{e.entityId}
              </span>
            </div>
          ))
        )}
      </div>
      {!autoScroll && (
        <button
          class="mt-2 text-[10px] text-[#175B37] font-bold hover:underline"
          onClick={() => {
            setAutoScroll(true);
            if (containerRef.current) {
              containerRef.current.scrollTop = containerRef.current.scrollHeight;
            }
          }}
        >
          ⬇ Reprendre l'auto-scroll
        </button>
      )}
    </div>
  );
}
