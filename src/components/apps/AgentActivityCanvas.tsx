import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';

type Kind =
  | 'task'
  | 'issue'
  | 'dependency'
  | 'request'
  | 'commit'
  | 'chat_session'
  | 'chat_step'
  | 'activity'
  | 'cost'
  | 'run';

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

type TimelineEvent = {
  id: string;
  kind: Kind;
  when: string;
  actorId: string | null;
  actorType: 'agent' | 'user' | 'system' | 'commit';
  title: string;
  summary?: string | null;
  status?: string | null;
  tone?: Tone;
  files?: string[];
  href?: string | null;
  meta?: Record<string, unknown>;
};

type AgentStat = {
  agentId: string;
  events: number;
  tasks: { total: number; running: number; pending: number; done: number; failed: number };
  issues: number;
  commits: number;
  costCents: number;
  lastEventAt: string | null;
};

type CanvasPayload = {
  project: { id: number; name: string; path: string | null; swarmEnabled: boolean } | null;
  folderKey: string;
  git: { isRepo: boolean; branch: string | null; dirty: boolean };
  stats: { totalEvents: number; shownEvents: number; counts: Record<Kind, number> };
  agents: AgentStat[];
  events: TimelineEvent[];
};

type Props = {
  appName: string;
  /** Filtre initial : tous les kinds par défaut. */
  initialKind?: Kind | 'all';
};

const KIND_ORDER: { key: Kind | 'all'; label: string }[] = [
  { key: 'all', label: 'Tout' },
  { key: 'task', label: 'Tâches' },
  { key: 'issue', label: 'Issues' },
  { key: 'commit', label: 'Commits' },
  { key: 'request', label: 'Demandes' },
  { key: 'chat_step', label: 'Chat' },
  { key: 'chat_session', label: 'Sessions' },
  { key: 'dependency', label: 'Deps' },
  { key: 'activity', label: 'Activité' },
  { key: 'cost', label: 'Coûts' },
  { key: 'run', label: 'Runs' },
];

const KIND_META: Record<Kind, { label: string; icon: string; ring: string; chip: string }> = {
  task: { label: 'Tâche', icon: '🛠', ring: 'ring-blue-200', chip: 'bg-blue-50 text-blue-700' },
  issue: { label: 'Issue', icon: '⚠', ring: 'ring-rose-200', chip: 'bg-rose-50 text-rose-700' },
  dependency: { label: 'Dépendance', icon: '📦', ring: 'ring-amber-200', chip: 'bg-amber-50 text-amber-700' },
  request: { label: 'Demande', icon: '💬', ring: 'ring-violet-200', chip: 'bg-violet-50 text-violet-700' },
  commit: { label: 'Commit', icon: '⎇', ring: 'ring-emerald-200', chip: 'bg-emerald-50 text-emerald-700' },
  chat_session: { label: 'Session', icon: '◎', ring: 'ring-cyan-200', chip: 'bg-cyan-50 text-cyan-700' },
  chat_step: { label: 'Chat', icon: '✦', ring: 'ring-cyan-200', chip: 'bg-cyan-50 text-cyan-700' },
  activity: { label: 'Activité', icon: '◆', ring: 'ring-slate-200', chip: 'bg-slate-100 text-slate-600' },
  cost: { label: 'Coût', icon: '€', ring: 'ring-pink-200', chip: 'bg-pink-50 text-pink-700' },
  run: { label: 'Run', icon: '▶', ring: 'ring-indigo-200', chip: 'bg-indigo-50 text-indigo-700' },
};

const TONE_BG: Record<Tone, string> = {
  neutral: 'bg-gray-100 text-gray-600',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-yellow-50 text-yellow-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-blue-50 text-blue-700',
};

const PALETTE = [
  'bg-blue-100 text-blue-800',
  'bg-violet-100 text-violet-800',
  'bg-emerald-100 text-emerald-800',
  'bg-amber-100 text-amber-900',
  'bg-rose-100 text-rose-800',
  'bg-cyan-100 text-cyan-800',
  'bg-indigo-100 text-indigo-800',
  'bg-fuchsia-100 text-fuchsia-800',
];

function paletteFor(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

function initialsOf(s: string): string {
  const t = String(s || '').trim();
  if (!t) return '?';
  const parts = t.split(/[\s_:.-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const delta = Date.now() - t;
  if (delta < 0) return 'à l’instant';
  const sec = Math.floor(delta / 1000);
  if (sec < 45) return `il y a ${sec || 1} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `il y a ${d} j`;
  const w = Math.floor(d / 7);
  if (w < 5) return `il y a ${w} sem`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `il y a ${mo} mois`;
  const y = Math.floor(d / 365);
  return `il y a ${y} an${y > 1 ? 's' : ''}`;
}

function formatAbsolute(iso: string): string {
  const t = new Date(iso);
  if (!Number.isFinite(t.getTime())) return iso;
  return t.toLocaleString('fr-FR', {
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatAgentLabel(id: string): string {
  return String(id || '')
    .replace(/^agent:/, '')
    .replace(/^telegram:g-agent-/, '')
    .replace(/_/g, ' ');
}

export default function AgentActivityCanvas({ appName, initialKind = 'all' }: Props) {
  const apiUrl = `/api/projects/${encodeURIComponent(appName)}/agent-canvas?limit=200`;
  const [data, setData] = useState<CanvasPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind | 'all'>(initialKind);
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(apiUrl, { headers: { 'Cache-Control': 'no-store' } });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      setData(json as CanvasPayload);
      setRefreshedAt(Date.now());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!autoRefresh) return;
    timerRef.current = window.setInterval(() => {
      load();
    }, 15000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [autoRefresh, load]);

  const events = data?.events ?? [];
  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (kind !== 'all' && e.kind !== kind) return false;
      if (agentFilter && (e.actorId || '').toLowerCase() !== agentFilter.toLowerCase()) return false;
      return true;
    });
  }, [events, kind, agentFilter]);

  const groups = useMemo(() => groupByDay(filtered), [filtered]);
  const counts = data?.stats.counts;
  const agents = data?.agents ?? [];
  const totalShown = data?.stats.shownEvents ?? 0;
  const totalAll = data?.stats.totalEvents ?? 0;

  return (
    <section class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
      <header class="px-6 pt-6 pb-4 border-b border-gray-100 bg-gradient-to-br from-white via-white to-emerald-50/40">
        <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold">
              Activité des agents
            </p>
            <h2 class="mt-1 text-xl font-bold text-gray-900">
              Ce que les agents ont fait sur ce projet
            </h2>
            <p class="mt-1 text-xs text-gray-500">
              Timeline unifiée : tâches, commits, demandes, issues, conversations, coûts.
              {data && (
                <span class="ml-2 text-gray-400">
                  {totalAll} événement{totalAll > 1 ? 's' : ''} total
                  {totalShown < totalAll ? `, ${totalShown} affichés` : ''}.
                </span>
              )}
            </p>
          </div>
          <div class="flex items-center gap-2 text-[11px] text-gray-500">
            <label class="inline-flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh((e.target as HTMLInputElement).checked)}
                class="rounded border-gray-300 text-[#175B37] focus:ring-[#175B37]"
              />
              <span>Auto-refresh 15s</span>
            </label>
            <button
              type="button"
              onClick={load}
              class="px-2.5 py-1 rounded-md border border-gray-200 hover:border-[#175B37] hover:text-[#175B37] transition-colors"
            >
              ↻ Rafraîchir
            </button>
            {refreshedAt && (
              <span class="text-[10px] text-gray-400 font-mono">
                {new Date(refreshedAt).toLocaleTimeString('fr-FR')}
              </span>
            )}
          </div>
        </div>
      </header>

      {loading && !data && (
        <div class="px-6 py-10 text-center text-sm text-gray-400">
          Chargement de l’activité agents…
        </div>
      )}

      {error && (
        <div class="px-6 py-4 text-sm text-red-600 bg-red-50 border-b border-red-100">
          Erreur : {error}
        </div>
      )}

      {data && (
        <>
          <AgentStatsStrip
            agents={agents}
            activeAgentId={agentFilter}
            onSelectAgent={(id) => setAgentFilter((cur) => (cur === id ? null : id))}
          />

          <div class="px-6 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 bg-gray-50/60">
            {KIND_ORDER.map((k) => {
              const n = k.key === 'all'
                ? data.stats.totalEvents
                : counts
                  ? counts[k.key as Kind] || 0
                  : 0;
              const active = kind === k.key;
              return (
                <button
                  type="button"
                  onClick={() => setKind(k.key)}
                  class={`px-3 py-1 rounded-full text-[11px] font-medium transition-colors border ${
                    active
                      ? 'bg-[#175B37] text-white border-[#175B37]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#175B37] hover:text-[#175B37]'
                  }`}
                >
                  {k.label}
                  {n > 0 && (
                    <span class={`ml-1 text-[10px] ${active ? 'opacity-80' : 'text-gray-400'}`}>
                      {n}
                    </span>
                  )}
                </button>
              );
            })}
            {agentFilter && (
              <button
                type="button"
                onClick={() => setAgentFilter(null)}
                class="ml-auto px-3 py-1 rounded-full text-[11px] font-medium bg-white border border-gray-300 text-gray-600 hover:border-rose-400 hover:text-rose-500"
              >
                ✕ Filtre agent : {formatAgentLabel(agentFilter)}
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div class="px-6 py-12 text-center text-sm text-gray-400">
              Aucun événement pour ce filtre.
              {kind !== 'all' && (
                <button
                  type="button"
                  onClick={() => setKind('all')}
                  class="ml-2 underline text-[#175B37]"
                >
                  Voir tout
                </button>
              )}
            </div>
          ) : (
            <ol class="px-6 py-5 space-y-6">
              {groups.map((g) => (
                <li key={g.day}>
                  <div class="sticky top-0 z-10 mb-3 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/80 backdrop-blur border border-gray-200 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
                    <span class="text-[#175B37]">●</span>
                    {g.label} <span class="text-gray-400 font-mono">({g.items.length})</span>
                  </div>
                  <ul class="relative space-y-3 ml-2 border-l border-dashed border-gray-200 pl-5">
                    {g.items.map((e) => (
                      <li key={e.id}>
                        <EventRow event={e} onSelectAgent={(id) => setAgentFilter(id)} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function AgentStatsStrip({
  agents,
  activeAgentId,
  onSelectAgent,
}: {
  agents: AgentStat[];
  activeAgentId: string | null;
  onSelectAgent: (id: string) => void;
}) {
  if (agents.length === 0) {
    return (
      <div class="px-6 py-3 border-b border-gray-100 text-xs text-gray-400">
        Aucun agent n’a encore travaillé sur ce projet.
      </div>
    );
  }
  const top = agents.slice(0, 8);
  return (
    <div class="px-6 py-4 border-b border-gray-100 bg-white">
      <p class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-3">
        Agents intervenants
      </p>
      <div class="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {top.map((a) => {
          const label = formatAgentLabel(a.agentId);
          const isActive = activeAgentId?.toLowerCase() === a.agentId.toLowerCase();
          return (
            <button
              key={a.agentId}
              type="button"
              onClick={() => onSelectAgent(a.agentId)}
              class={`flex-shrink-0 min-w-[180px] text-left rounded-2xl border transition-all p-3 ${
                isActive
                  ? 'border-[#175B37] bg-emerald-50/60 shadow-sm'
                  : 'border-gray-100 bg-gray-50 hover:bg-white hover:border-gray-200'
              }`}
              title={a.agentId}
            >
              <div class="flex items-center gap-2.5">
                <span
                  class={`flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold ${paletteFor(a.agentId)}`}
                >
                  {initialsOf(label)}
                </span>
                <div class="min-w-0 flex-1">
                  <p class="text-[12px] font-semibold text-gray-800 truncate">{label}</p>
                  <p class="text-[10px] text-gray-400 font-mono truncate">{a.agentId}</p>
                </div>
              </div>
              <div class="mt-3 grid grid-cols-3 gap-1.5 text-center text-[10px]">
                <Stat label="Tâches" value={a.tasks.total} accent="text-blue-700" />
                <Stat label="Issues" value={a.issues} accent="text-rose-700" />
                <Stat label="Commits" value={a.commits} accent="text-emerald-700" />
              </div>
              <div class="mt-2 flex items-center justify-between text-[10px] text-gray-500">
                <span>
                  ✓ {a.tasks.done} · ▶ {a.tasks.running} · ⏳ {a.tasks.pending}
                  {a.tasks.failed ? ` · ✕ ${a.tasks.failed}` : ''}
                </span>
                {a.costCents > 0 && (
                  <span class="font-mono text-pink-700">
                    {(a.costCents / 100).toFixed(2)} €
                  </span>
                )}
              </div>
              {a.lastEventAt && (
                <p class="mt-1 text-[10px] text-gray-400">
                  Dernier : {formatRelative(a.lastEventAt)}
                </p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div class="rounded-lg bg-white border border-gray-100 px-1 py-1.5">
      <div class={`text-sm font-bold ${accent}`}>{value}</div>
      <div class="text-gray-400 uppercase tracking-wider text-[9px]">{label}</div>
    </div>
  );
}

function EventRow({
  event,
  onSelectAgent,
}: {
  event: TimelineEvent;
  onSelectAgent: (id: string) => void;
}) {
  const meta = KIND_META[event.kind];
  const tone = event.tone || 'neutral';
  const agentLabel = event.actorId ? formatAgentLabel(event.actorId) : null;
  const isExternal = event.href ? /^https?:/i.test(event.href) : false;

  return (
    <article class="relative">
      <span
        class={`absolute -left-[34px] top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm ring-2 ${meta.ring}`}
        aria-hidden="true"
      >
        <span class="text-[12px] leading-none">{meta.icon}</span>
      </span>
      <div class="rounded-xl border border-gray-100 bg-white hover:border-gray-200 hover:shadow-sm transition-all p-4">
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${meta.chip}`}
              >
                {meta.label}
              </span>
              {event.status && (
                <span
                  class={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TONE_BG[tone]}`}
                >
                  {event.status}
                </span>
              )}
              {event.actorId && (
                <button
                  type="button"
                  onClick={() => onSelectAgent(event.actorId as string)}
                  class={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full ${paletteFor(event.actorId)} hover:opacity-90`}
                  title={`Filtrer sur ${event.actorId}`}
                >
                  <span class="font-bold">{initialsOf(agentLabel ?? event.actorId)}</span>
                  <span class="truncate max-w-[160px]">{agentLabel}</span>
                </button>
              )}
            </div>
            <p class="mt-2 text-sm font-medium text-gray-900 break-words">{event.title}</p>
            {event.summary && (
              <p class="mt-1 text-[12px] text-gray-500 leading-snug whitespace-pre-wrap break-words line-clamp-3">
                {event.summary}
              </p>
            )}
            {event.files && event.files.length > 0 && (
              <ul class="mt-2 flex flex-wrap gap-1.5">
                {event.files.map((f) => (
                  <li
                    key={f}
                    class="text-[10px] font-mono px-2 py-0.5 rounded bg-gray-50 border border-gray-100 text-gray-600 truncate max-w-[280px]"
                    title={f}
                  >
                    {f}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div class="flex flex-col items-end gap-1 shrink-0">
            <time
              class="text-[10px] text-gray-400 font-mono"
              title={formatAbsolute(event.when)}
            >
              {formatRelative(event.when)}
            </time>
            {event.href && (
              <a
                href={event.href}
                target={isExternal ? '_blank' : undefined}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                class="text-[11px] text-[#175B37] hover:underline"
              >
                Ouvrir →
              </a>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

type DayGroup = { day: string; label: string; items: TimelineEvent[] };

function groupByDay(events: TimelineEvent[]): DayGroup[] {
  const map = new Map<string, TimelineEvent[]>();
  for (const e of events) {
    const d = new Date(e.when);
    const key = Number.isFinite(d.getTime()) ? d.toISOString().slice(0, 10) : 'inconnu';
    let bucket = map.get(key);
    if (!bucket) {
      bucket = [];
      map.set(key, bucket);
    }
    bucket.push(e);
  }
  const groups: DayGroup[] = [];
  const todayKey = new Date().toISOString().slice(0, 10);
  const yKey = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  for (const [key, items] of [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))) {
    let label = key;
    if (key === todayKey) label = "Aujourd'hui";
    else if (key === yKey) label = 'Hier';
    else if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      const d = new Date(key);
      label = d.toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
      });
    }
    groups.push({ day: key, label, items });
  }
  return groups;
}
