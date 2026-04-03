import { useEffect, useMemo, useState } from 'preact/hooks';

type Stats = {
  totalSessions: number;
  activeCount: number;
  idleCount: number;
  uniqueAgents: number;
  edgeCount: number;
  messageCount: number;
  taskCount: number;
};

type Edge = {
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  kind: string;
  atLabel: string;
};

type Event = {
  id: string;
  kind: 'topology' | 'message' | 'task';
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  summary: string;
  at: number;
  atLabel: string;
};

type Payload = {
  gatewayError: string | null;
  stats: Stats;
  edges: Edge[];
  timeline: Event[];
};

const FILTERS: { id: 'all' | 'topology' | 'message' | 'task'; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'topology', label: 'Topologie' },
  { id: 'message', label: 'Messages DB' },
  { id: 'task', label: 'Tâches' },
];

function kindBadge(kind: Event['kind']) {
  if (kind === 'topology')
    return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
  if (kind === 'message')
    return 'bg-sky-500/15 text-sky-300 border-sky-500/30';
  return 'bg-amber-500/15 text-amber-200 border-amber-500/30';
}

function kindLabel(kind: Event['kind']) {
  if (kind === 'topology') return 'Session';
  if (kind === 'message') return 'Message';
  return 'Tâche';
}

function swarmHref(id: string): string | null {
  if (!id || id === '—' || id === 'Orchestration') return null;
  return '/swarm/' + encodeURIComponent(id);
}

export default function SwarmInteractionsBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['id']>('all');

  useEffect(() => {
    fetch('/api/swarm-interactions')
      .then((r) => r.json())
      .then((d: Payload & { error?: string }) => {
        if (d.error) setError(String(d.error));
        setData({
          gatewayError: d.gatewayError ?? null,
          stats: d.stats ?? {
            totalSessions: 0,
            activeCount: 0,
            idleCount: 0,
            uniqueAgents: 0,
            edgeCount: 0,
            messageCount: 0,
            taskCount: 0,
          },
          edges: Array.isArray(d.edges) ? d.edges : [],
          timeline: Array.isArray(d.timeline) ? d.timeline : [],
        });
      })
      .catch(() => setError('Chargement impossible'))
      .finally(() => setLoading(false));
  }, []);

  const filteredTimeline = useMemo(() => {
    if (!data?.timeline) return [];
    if (filter === 'all') return data.timeline;
    return data.timeline.filter((e) => e.kind === filter);
  }, [data, filter]);

  if (loading) {
    return (
      <div class="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center text-slate-500 animate-pulse">
        Chargement des interactions…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div class="rounded-xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">{error}</div>
    );
  }

  const s = data!.stats;

  return (
    <div class="space-y-8">
      {data!.gatewayError && (
        <div class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          OpenClaw : {data!.gatewayError} — la topologie sessions peut être vide. Vérifiez le jeton et l’URL du
          gateway dans les paramètres.
        </div>
      )}

      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Sessions</p>
          <p class="text-2xl font-bold text-white mt-1">{s.totalSessions}</p>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Actives</p>
          <p class="text-2xl font-bold text-emerald-400 mt-1">{s.activeCount}</p>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Liens parent→sub</p>
          <p class="text-2xl font-bold text-violet-400 mt-1">{s.edgeCount}</p>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Messages (DB)</p>
          <p class="text-2xl font-bold text-sky-400 mt-1">{s.messageCount}</p>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Tâches (DB)</p>
          <p class="text-2xl font-bold text-amber-400 mt-1">{s.taskCount}</p>
        </div>
        <div class="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <p class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Agents (noms)</p>
          <p class="text-2xl font-bold text-white mt-1">{s.uniqueAgents}</p>
        </div>
      </div>

      <section class="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl">
        <div class="border-b border-slate-800 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 class="text-lg font-bold text-white">Interactions entre agents</h3>
            <p class="text-xs text-slate-500 mt-1 max-w-2xl">
              Fil unifié : liens de session détectés (main → sub-agent), messages en base{' '}
              <span class="font-mono text-slate-600">AgentMessage</span>, et tâches{' '}
              <span class="font-mono text-slate-600">AgentTask</span>.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                class={
                  'btn btn-xs border ' +
                  (filter === f.id
                    ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-slate-950 border-slate-700 text-slate-400 hover:text-white')
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="table table-zebra w-full text-sm">
            <thead>
              <tr class="text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-800 bg-slate-950/80">
                <th class="px-4 py-3 text-left">Type</th>
                <th class="px-4 py-3 text-left">De</th>
                <th class="px-4 py-3 text-left">Vers</th>
                <th class="px-4 py-3 text-left">Résumé</th>
                <th class="px-4 py-3 text-left whitespace-nowrap">Quand</th>
              </tr>
            </thead>
            <tbody>
              {filteredTimeline.length === 0 ? (
                <tr>
                  <td colSpan={5} class="px-4 py-12 text-center text-slate-500 text-sm">
                    Aucune entrée pour ce filtre. Les messages et tâches apparaissent quand les agents les
                    enregistrent en base ; les liens session utilisent les clés OpenClaw (
                    <span class="font-mono">…:subagent:…</span>).
                  </td>
                </tr>
              ) : (
                filteredTimeline.map((e) => (
                  <tr key={e.id} class="border-slate-800/60 hover:bg-slate-800/20">
                    <td class="px-4 py-3 align-top">
                      <span
                        class={'text-[10px] font-bold uppercase px-2 py-1 rounded border ' + kindBadge(e.kind)}
                      >
                        {kindLabel(e.kind)}
                      </span>
                    </td>
                    <td class="px-4 py-3 align-top">
                      {swarmHref(e.from) ? (
                        <a
                          href={swarmHref(e.from)!}
                          class="font-mono text-xs text-blue-400 hover:text-blue-300 break-all max-w-[10rem] inline-block"
                        >
                          {e.fromLabel}
                        </a>
                      ) : (
                        <span class="font-mono text-xs text-slate-400">{e.fromLabel}</span>
                      )}
                    </td>
                    <td class="px-4 py-3 align-top">
                      {e.to !== '—' && swarmHref(e.to) ? (
                        <a
                          href={swarmHref(e.to)!}
                          class="font-mono text-xs text-emerald-400/90 hover:text-emerald-300 break-all max-w-[10rem] inline-block"
                        >
                          {e.toLabel}
                        </a>
                      ) : (
                        <span class="text-slate-600 text-xs">{e.to === '—' ? '—' : e.toLabel}</span>
                      )}
                    </td>
                    <td class="px-4 py-3 align-top text-slate-300 text-xs leading-relaxed max-w-md">
                      {e.summary}
                    </td>
                    <td class="px-4 py-3 align-top text-[10px] text-slate-500 font-mono whitespace-nowrap">
                      {e.atLabel}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data!.edges.length > 0 && (
        <section class="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h4 class="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Arêtes (vue rapide)</h4>
          <ul class="flex flex-col gap-3">
            {data!.edges.map((e, i) => (
              <li
                key={e.from + e.to + i}
                class="flex flex-wrap items-center gap-2 text-xs text-slate-300 font-mono"
              >
                <a href={swarmHref(e.from) || '#'} class="text-blue-400 hover:underline">
                  {e.fromLabel}
                </a>
                <span class="text-slate-600">→</span>
                <a href={swarmHref(e.to) || '#'} class="text-emerald-400/90 hover:underline">
                  {e.toLabel}
                </a>
                <span class="text-slate-600 ml-auto text-[10px]">{e.atLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
