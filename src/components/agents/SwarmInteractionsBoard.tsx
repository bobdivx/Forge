import { useEffect, useMemo, useState } from 'preact/hooks';

type Stats = { totalSessions: number; activeCount: number; idleCount: number; uniqueAgents: number; edgeCount: number; messageCount: number; taskCount: number; };
type Edge = { from: string; to: string; fromLabel: string; toLabel: string; kind: string; atLabel: string; };
type Event = { id: string; kind: 'topology' | 'message' | 'task'; from: string; to: string; fromLabel: string; toLabel: string; summary: string; at: number; atLabel: string; };
type Payload = { gatewayError: string | null; stats: Stats; edges: Edge[]; timeline: Event[]; };

const FILTERS: { id: 'all' | 'topology' | 'message' | 'task'; label: string }[] = [
  { id: 'all', label: 'Tout' },
  { id: 'topology', label: 'Topologie' },
  { id: 'message', label: 'Messages DB' },
  { id: 'task', label: 'Tâches' },
];

function kindBadge(kind: Event['kind']) {
  if (kind === 'topology') return 'bg-purple-50 text-purple-600';
  if (kind === 'message') return 'bg-sky-50 text-sky-600';
  return 'bg-yellow-50 text-yellow-600';
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
          stats: d.stats ?? { totalSessions: 0, activeCount: 0, idleCount: 0, uniqueAgents: 0, edgeCount: 0, messageCount: 0, taskCount: 0 },
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

  if (loading) return (
    <div class="bg-white rounded-[1.5rem] border border-gray-100 p-10 text-center text-gray-400 animate-pulse shadow-sm">
      Chargement des interactions…
    </div>
  );
  if (error && !data) return (
    <div class="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-600">{error}</div>
  );

  const s = data!.stats;

  return (
    <div class="space-y-6">
      {data!.gatewayError && (
        <div class="rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
          OpenClaw : {data!.gatewayError} — vérifiez le jeton et l'URL du gateway dans les paramètres.
        </div>
      )}

      {/* Stats */}
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Sessions',      val: s.totalSessions, color: '#1F2937' },
          { label: 'Actives',       val: s.activeCount,   color: '#3BAE61' },
          { label: 'Liens',         val: s.edgeCount,     color: '#8B5CF6' },
          { label: 'Messages (DB)', val: s.messageCount,  color: '#0EA5E9' },
          { label: 'Tâches (DB)',   val: s.taskCount,     color: '#F59E0B' },
          { label: 'Agents',        val: s.uniqueAgents,  color: '#1F2937' },
        ].map(({ label, val, color }) => (
          <div key={label} class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-4">
            <p class="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</p>
            <p class="text-2xl font-bold mt-1" style={{ color }}>{val}</p>
          </div>
        ))}
      </div>

      {/* Timeline */}
      <section class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden">
        <div class="border-b border-gray-100 px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 class="text-base font-bold text-gray-900">Interactions entre agents</h3>
            <p class="text-xs text-gray-400 mt-0.5 max-w-2xl">
              Fil unifié : sessions, messages <span class="font-mono text-gray-500">AgentMessage</span>, et tâches <span class="font-mono text-gray-500">AgentTask</span>.
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                class="text-xs px-3 py-1.5 rounded-full font-medium border transition-colors"
                style={filter === f.id
                  ? 'background:#175B37;color:white;border-color:#175B37'
                  : 'background:white;color:#6B7280;border-color:#E5E7EB'}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-100">
                <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-left">Type</th>
                <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-left">De</th>
                <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-left">Vers</th>
                <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-left">Résumé</th>
                <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-left whitespace-nowrap">Quand</th>
              </tr>
            </thead>
            <tbody>
              {filteredTimeline.length === 0 ? (
                <tr><td colSpan={5} class="px-5 py-10 text-center text-gray-400 text-sm italic">Aucune entrée pour ce filtre.</td></tr>
              ) : (
                filteredTimeline.map((e) => (
                  <tr key={e.id} class="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td class="px-5 py-3 align-top">
                      <span class={`text-[10px] font-bold uppercase px-2 py-1 rounded ${kindBadge(e.kind)}`}>{kindLabel(e.kind)}</span>
                    </td>
                    <td class="px-5 py-3 align-top">
                      {swarmHref(e.from)
                        ? <a href={swarmHref(e.from)!} class="font-mono text-xs text-blue-500 hover:underline break-all max-w-[10rem] inline-block">{e.fromLabel}</a>
                        : <span class="font-mono text-xs text-gray-400">{e.fromLabel}</span>}
                    </td>
                    <td class="px-5 py-3 align-top">
                      {e.to !== '—' && swarmHref(e.to)
                        ? <a href={swarmHref(e.to)!} class="font-mono text-xs hover:underline break-all max-w-[10rem] inline-block" style="color:#3BAE61">{e.toLabel}</a>
                        : <span class="text-gray-400 text-xs">{e.to === '—' ? '—' : e.toLabel}</span>}
                    </td>
                    <td class="px-5 py-3 align-top text-gray-700 text-xs leading-relaxed max-w-md">{e.summary}</td>
                    <td class="px-5 py-3 align-top text-[10px] text-gray-400 font-mono whitespace-nowrap">{e.atLabel}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {data!.edges.length > 0 && (
        <section class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-6">
          <h4 class="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-4">Arêtes (vue rapide)</h4>
          <ul class="flex flex-col gap-3">
            {data!.edges.map((e, i) => (
              <li key={e.from + e.to + i} class="flex flex-wrap items-center gap-2 text-xs font-mono text-gray-600">
                <a href={swarmHref(e.from) || '#'} class="text-blue-500 hover:underline">{e.fromLabel}</a>
                <span class="text-gray-300">→</span>
                <a href={swarmHref(e.to) || '#'} class="hover:underline" style="color:#3BAE61">{e.toLabel}</a>
                <span class="text-gray-400 ml-auto text-[10px]">{e.atLabel}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
