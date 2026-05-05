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

type BadgeTone = 'neutral' | 'mono' | 'success' | 'warning' | 'danger' | 'info';

type EventBadge = {
  label: string;
  value: string;
  tone?: BadgeTone;
};

export type GitFileChange = {
  status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U' | 'X';
  path: string;
  oldPath?: string;
  /** Présent uniquement pour les fichiers de l'arbre de travail. */
  area?: 'staged' | 'unstaged' | 'untracked' | 'conflict';
};

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
  badges?: EventBadge[];
  entityRef?: string | null;
  meta?: Record<string, unknown>;
};

/** Cible ouverte par la modal de diff. */
type DiffTarget = {
  hash: string;
  shortHash: string;
  subject: string;
  author?: string | null;
  when?: string | null;
  files: GitFileChange[];
  /** Fichier sélectionné par défaut (sinon : commit complet). */
  initialFile?: string | null;
  /** Vrai pour le pseudo-événement « modifications en cours ». */
  isWorking?: boolean;
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

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-gray-50 border-gray-200 text-gray-700',
  mono: 'bg-slate-50 border-slate-200 text-slate-700 font-mono',
  success: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  warning: 'bg-amber-50 border-amber-200 text-amber-700',
  danger: 'bg-rose-50 border-rose-200 text-rose-700',
  info: 'bg-sky-50 border-sky-200 text-sky-700',
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
  const [diffTarget, setDiffTarget] = useState<DiffTarget | null>(null);
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
                        <EventRow
                          event={e}
                          appName={appName}
                          onSelectAgent={(id) => setAgentFilter(id)}
                          onOpenDiff={(target) => setDiffTarget(target)}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          )}
        </>
      )}

      {diffTarget && (
        <DiffModal
          appName={appName}
          target={diffTarget}
          onClose={() => setDiffTarget(null)}
        />
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

/** Détecte si une chaîne est en réalité du JSON brut qu'il vaut mieux ne pas afficher tel quel. */
function looksLikeJson(text: string): boolean {
  const t = text.trim();
  return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

const FILE_STATUS_META: Record<
  GitFileChange['status'],
  { label: string; chip: string; symbol: string }
> = {
  A: { label: 'ajouté', chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', symbol: '+' },
  M: { label: 'modifié', chip: 'bg-blue-50 text-blue-700 border-blue-200', symbol: 'M' },
  D: { label: 'supprimé', chip: 'bg-rose-50 text-rose-700 border-rose-200', symbol: '−' },
  R: { label: 'renommé', chip: 'bg-amber-50 text-amber-800 border-amber-200', symbol: '↦' },
  C: { label: 'copié', chip: 'bg-violet-50 text-violet-700 border-violet-200', symbol: '⎘' },
  T: { label: 'type changé', chip: 'bg-slate-50 text-slate-700 border-slate-200', symbol: 'T' },
  U: { label: 'conflit', chip: 'bg-red-50 text-red-700 border-red-300', symbol: '⚠' },
  X: { label: 'inconnu', chip: 'bg-gray-50 text-gray-600 border-gray-200', symbol: '?' },
};

function asFileChanges(v: unknown): GitFileChange[] {
  if (!Array.isArray(v)) return [];
  const out: GitFileChange[] = [];
  for (const x of v) {
    if (x && typeof x === 'object' && 'path' in x && 'status' in x) {
      out.push(x as GitFileChange);
    }
  }
  return out;
}

function EventRow({
  event,
  appName,
  onSelectAgent,
  onOpenDiff,
}: {
  event: TimelineEvent;
  appName: string;
  onSelectAgent: (id: string) => void;
  onOpenDiff: (target: DiffTarget) => void;
}) {
  const meta = KIND_META[event.kind];
  const tone = event.tone || 'neutral';
  const agentLabel = event.actorId ? formatAgentLabel(event.actorId) : null;
  const isExternal = event.href ? /^https?:/i.test(event.href) : false;
  const showSummary = event.summary && !looksLikeJson(event.summary);
  // Pour ne pas dupliquer le statut quand il fait déjà partie du titre humanisé.
  const statusBadge =
    event.status && event.status.toLowerCase() !== event.title.toLowerCase()
      ? event.status
      : null;

  const isCommit = event.kind === 'commit';
  const commitMeta = (event.meta ?? {}) as Record<string, unknown>;
  const commitFiles = isCommit ? asFileChanges(commitMeta.files) : [];
  const commitHash = isCommit ? (commitMeta.hash as string | undefined) : undefined;
  const commitShort = isCommit ? (commitMeta.shortHash as string | undefined) : undefined;
  const isWorking = isCommit && commitMeta.isWorking === true;

  const openDiff = (initialFile?: string | null) => {
    if (!isCommit || !commitHash) return;
    onOpenDiff({
      hash: commitHash,
      shortHash: commitShort ?? commitHash.slice(0, 7),
      subject: event.title,
      author: typeof commitMeta.author === 'string' ? (commitMeta.author as string) : null,
      when: event.when,
      files: commitFiles,
      initialFile: initialFile ?? null,
      isWorking,
    });
  };
  // Note : `appName` reste utile au composant DiffModal en aval, ici on l'a déjà.
  void appName;

  return (
    <article class="relative">
      <span
        class={`absolute -left-[34px] top-3 flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-sm ring-2 ${
          isWorking ? 'ring-amber-300 animate-pulse' : meta.ring
        }`}
        aria-hidden="true"
      >
        <span class="text-[12px] leading-none">{isWorking ? '✎' : meta.icon}</span>
      </span>
      <div
        class={`rounded-xl border bg-white transition-all p-4 ${
          isWorking
            ? 'border-amber-200 bg-amber-50/30 hover:border-amber-300'
            : 'border-gray-100 hover:border-gray-200 hover:shadow-sm'
        }`}
      >
        <div class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2">
              <span
                class={`text-[10px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                  isWorking ? 'bg-amber-100 text-amber-800' : meta.chip
                }`}
              >
                {isWorking ? 'En cours' : meta.label}
              </span>
              {event.entityRef && (
                <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-gray-50 border border-gray-200 text-gray-500">
                  {event.entityRef}
                </span>
              )}
              {statusBadge && (
                <span
                  class={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${TONE_BG[tone]}`}
                >
                  {statusBadge}
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
            {showSummary && (
              <p class="mt-1 text-[12px] text-gray-500 leading-snug whitespace-pre-wrap break-words line-clamp-3">
                {event.summary}
              </p>
            )}
            {event.badges && event.badges.length > 0 && (
              <ul class="mt-2 flex flex-wrap gap-1.5">
                {event.badges.map((b, i) => {
                  const tn = b.tone ?? 'neutral';
                  return (
                    <li
                      key={`${b.label}-${i}`}
                      class={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] ${BADGE_TONE[tn]}`}
                      title={`${b.label} : ${b.value}`}
                    >
                      <span class="text-[9px] uppercase tracking-wider opacity-60">
                        {b.label}
                      </span>
                      <span class="font-medium truncate max-w-[200px]">{b.value}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            {isCommit && commitFiles.length > 0 && (
              <ul class="mt-2 flex flex-wrap gap-1.5">
                {commitFiles.map((f) => {
                  const m = FILE_STATUS_META[f.status] ?? FILE_STATUS_META.X;
                  const display = f.oldPath ? `${f.oldPath} → ${f.path}` : f.path;
                  const areaTag =
                    f.area === 'staged'
                      ? { letter: 'S', cls: 'bg-emerald-200 text-emerald-900', label: 'staged' }
                      : f.area === 'unstaged'
                        ? { letter: 'W', cls: 'bg-amber-200 text-amber-900', label: 'unstaged' }
                        : f.area === 'untracked'
                          ? { letter: 'N', cls: 'bg-slate-200 text-slate-800', label: 'nouveau' }
                          : f.area === 'conflict'
                            ? { letter: '!', cls: 'bg-red-200 text-red-900', label: 'conflit' }
                            : null;
                  return (
                    <li key={`${f.area ?? 'c'}-${f.status}-${f.path}`}>
                      <button
                        type="button"
                        onClick={() => openDiff(f.path)}
                        class={`group inline-flex items-center gap-1.5 max-w-[340px] text-[10px] px-2 py-0.5 rounded border ${m.chip} hover:shadow-sm transition-all`}
                        title={`Voir le diff de ${display}${areaTag ? ` (${areaTag.label})` : ''}`}
                      >
                        <span class="font-bold w-4 text-center">{m.symbol}</span>
                        {areaTag && (
                          <span
                            class={`text-[9px] font-bold rounded px-1 ${areaTag.cls}`}
                            aria-hidden="true"
                          >
                            {areaTag.letter}
                          </span>
                        )}
                        <span class="font-mono truncate">{display}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {!isCommit && event.files && event.files.length > 0 && (
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
            {isCommit && commitHash && (
              <button
                type="button"
                onClick={() => openDiff(null)}
                class={`text-[11px] hover:underline whitespace-nowrap ${
                  isWorking ? 'text-amber-700' : 'text-[#175B37]'
                }`}
              >
                {isWorking ? 'Voir les modifs en cours →' : 'Voir les modifs →'}
              </button>
            )}
            {event.href && !isCommit && (
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

function DiffModal({
  appName,
  target,
  onClose,
}: {
  appName: string;
  target: DiffTarget;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(target.initialFile ?? null);
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setError(null);
      setDiff('');
      try {
        const params = new URLSearchParams({ app: appName, hash: target.hash });
        if (selected) params.set('file', selected);
        const res = await fetch(`/api/git-commit?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
        setDiff(String(json?.diff ?? ''));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => {
      cancelled = true;
    };
  }, [appName, target.hash, selected]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const lines = useMemo(() => parseDiffLines(diff), [diff]);

  return (
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div class="bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden">
        <header
          class={`flex items-start justify-between gap-4 px-6 py-4 border-b ${
            target.isWorking
              ? 'border-amber-200 bg-gradient-to-br from-white to-amber-50/60'
              : 'border-gray-100 bg-gradient-to-br from-white to-emerald-50/40'
          }`}
        >
          <div class="min-w-0">
            <p
              class={`text-[10px] uppercase tracking-widest font-semibold ${
                target.isWorking ? 'text-amber-700' : 'text-gray-400'
              }`}
            >
              {target.isWorking ? 'Modifications en cours · arbre de travail' : 'Commit'}
            </p>
            <h3 class="mt-0.5 text-base font-bold text-gray-900 break-words">
              {target.subject}
            </h3>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
              <span
                class={`font-mono px-2 py-0.5 rounded border ${
                  target.isWorking
                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                {target.shortHash}
              </span>
              {target.author && !target.isWorking && (
                <span>
                  par <span class="text-gray-700">{target.author}</span>
                </span>
              )}
              {target.when && !target.isWorking && (
                <time class="font-mono text-gray-400" title={target.when}>
                  {formatAbsolute(target.when)}
                </time>
              )}
              <span class="text-gray-400">
                · {target.files.length} fichier{target.files.length > 1 ? 's' : ''} touché
                {target.files.length > 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            class="shrink-0 text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
            aria-label="Fermer"
          >
            ×
          </button>
        </header>

        <div class="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[260px_1fr] overflow-hidden">
          <aside class="border-r border-gray-100 bg-gray-50/60 overflow-y-auto">
            <button
              type="button"
              onClick={() => setSelected(null)}
              class={`w-full text-left px-4 py-2.5 border-b border-gray-100 text-[12px] font-medium transition-colors ${
                selected == null
                  ? 'bg-white text-[#175B37] border-l-2 border-l-[#175B37]'
                  : 'text-gray-600 hover:bg-white'
              }`}
            >
              <span class="flex items-center gap-2">
                <span class="text-[10px] uppercase tracking-widest text-gray-400">Tout</span>
                Diff complet
              </span>
            </button>
            <ul>
              {target.files.map((f) => {
                const m = FILE_STATUS_META[f.status] ?? FILE_STATUS_META.X;
                const isSel = selected === f.path;
                const areaTag =
                  f.area === 'staged'
                    ? { letter: 'S', cls: 'bg-emerald-200 text-emerald-900' }
                    : f.area === 'unstaged'
                      ? { letter: 'W', cls: 'bg-amber-200 text-amber-900' }
                      : f.area === 'untracked'
                        ? { letter: 'N', cls: 'bg-slate-200 text-slate-800' }
                        : f.area === 'conflict'
                          ? { letter: '!', cls: 'bg-red-200 text-red-900' }
                          : null;
                return (
                  <li key={`${f.area ?? 'c'}-${f.status}-${f.path}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(f.path)}
                      class={`w-full text-left px-4 py-2 text-[12px] font-mono break-all transition-colors flex items-center gap-2 ${
                        isSel
                          ? 'bg-white text-[#175B37] border-l-2 border-l-[#175B37]'
                          : 'text-gray-700 hover:bg-white'
                      }`}
                      title={f.oldPath ? `${f.oldPath} → ${f.path}` : f.path}
                    >
                      <span
                        class={`w-5 h-5 rounded inline-flex items-center justify-center text-[10px] font-bold border ${m.chip}`}
                      >
                        {m.symbol}
                      </span>
                      {areaTag && (
                        <span
                          class={`text-[9px] font-bold rounded px-1 ${areaTag.cls}`}
                          aria-hidden="true"
                        >
                          {areaTag.letter}
                        </span>
                      )}
                      <span class="truncate">{f.path}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </aside>

          <div class="overflow-auto bg-white">
            {loading && (
              <div class="px-6 py-12 text-center text-sm text-gray-400">
                Chargement du diff…
              </div>
            )}
            {error && !loading && (
              <div class="px-6 py-4 m-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg">
                {error}
              </div>
            )}
            {!loading && !error && (
              <pre class="text-[12px] font-mono leading-snug">
                <code>
                  {lines.map((ln, idx) => (
                    <DiffLine key={idx} line={ln} />
                  ))}
                </code>
              </pre>
            )}
          </div>
        </div>

        <footer class="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between text-[11px] text-gray-500">
          <span>
            {selected ? (
              <>
                Diff de <span class="font-mono text-gray-700">{selected}</span>
              </>
            ) : (
              'Diff complet du commit'
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            class="px-3 py-1 rounded-md border border-gray-200 hover:border-[#175B37] hover:text-[#175B37]"
          >
            Fermer (Esc)
          </button>
        </footer>
      </div>
    </div>
  );
}

type DiffLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'section' | 'context';
type ParsedDiffLine = { kind: DiffLineKind; text: string };

function parseDiffLines(diff: string): ParsedDiffLine[] {
  const out: ParsedDiffLine[] = [];
  const src = String(diff || '');
  if (!src) return out;
  for (const raw of src.split('\n')) {
    let kind: DiffLineKind = 'context';
    if (/^### .+ ###$/.test(raw)) kind = 'section';
    else if (raw.startsWith('@@')) kind = 'hunk';
    else if (
      raw.startsWith('diff --git') ||
      raw.startsWith('index ') ||
      raw.startsWith('--- ') ||
      raw.startsWith('+++ ') ||
      raw.startsWith('new file mode') ||
      raw.startsWith('deleted file mode') ||
      raw.startsWith('rename from') ||
      raw.startsWith('rename to') ||
      raw.startsWith('similarity index') ||
      raw.startsWith('Binary files') ||
      raw.startsWith('commit ') ||
      raw.startsWith('Author:') ||
      raw.startsWith('Date:')
    ) {
      kind = 'meta';
    } else if (raw.startsWith('+')) kind = 'add';
    else if (raw.startsWith('-')) kind = 'del';
    out.push({ kind, text: raw });
  }
  return out;
}

function DiffLine({ line }: { line: ParsedDiffLine }) {
  const cls =
    line.kind === 'add'
      ? 'bg-emerald-50 text-emerald-900'
      : line.kind === 'del'
        ? 'bg-rose-50 text-rose-900'
        : line.kind === 'hunk'
          ? 'bg-violet-50 text-violet-700'
          : line.kind === 'section'
            ? 'bg-amber-100 text-amber-900 font-semibold border-y border-amber-200'
            : line.kind === 'meta'
              ? 'bg-gray-50 text-gray-500'
              : 'text-gray-700';
  return (
    <span class={`block px-4 whitespace-pre-wrap break-all ${cls}`}>
      {line.text || '\u00a0'}
    </span>
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
