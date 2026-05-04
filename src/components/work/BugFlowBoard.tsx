import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

type Issue = {
  id: number;
  projectName: string;
  title: string;
  errorType: string;
  status: string;
  source: 'github' | 'detector' | 'agent';
  kanbanColumn: 'detected' | 'dispatched' | 'running' | 'resolved';
  assigneeAgentId: string | null;
  linkedTask: { id: number; agentId: string; status: string } | null;
  sparkline: number[];
  reportedByAgentId: string;
};

type Payload = {
  ok: boolean;
  issues?: Issue[];
};

const COL_SOURCE = {
  github: { bg: 'bg-sky-50', text: 'text-sky-700', label: 'GH' },
  detector: { bg: 'bg-amber-50', text: 'text-amber-700', label: 'Dev' },
  agent: { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'IA' },
};

function Sparkline({ values }: { values: number[] }) {
  const w = 56;
  const h = 20;
  const max = Math.max(1, ...values);
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * (w - 2) + 1;
      const y = h - 1 - (v / max) * (h - 2);
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg width={w} height={h} class="shrink-0 opacity-90" aria-hidden="true">
      <polyline fill="none" stroke="#175B37" stroke-width="1.5" points={pts} />
    </svg>
  );
}

export default function BugFlowBoard() {
  const [data, setData] = useState<Payload | null>(null);
  const [filter, setFilter] = useState<'all' | 'github' | 'detector' | 'agent'>('all');

  const load = useCallback(() => {
    fetch('/api/work-overview')
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ ok: false }));
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 15_000);
    return () => window.clearInterval(id);
  }, [load]);

  const filtered = useMemo(() => {
    const issues = data?.issues || [];
    if (filter === 'all') return issues;
    return issues.filter((i) => i.source === filter);
  }, [data?.issues, filter]);

  const cols: { id: Issue['kanbanColumn']; title: string; desc: string }[] = [
    { id: 'detected', title: 'Détecté', desc: 'Pas encore dispatché' },
    { id: 'dispatched', title: 'Dispatché', desc: 'File ou in_progress' },
    { id: 'running', title: 'En cours', desc: 'Tâche running' },
    { id: 'resolved', title: 'Résolu', desc: 'Clôturé' },
  ];

  if (!data?.ok && data !== null) {
    return <div class="text-sm text-red-600 p-4">Impossible de charger le flux anomalies.</div>;
  }

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap gap-2 items-center">
        <span class="text-[10px] font-bold uppercase tracking-widest text-gray-400 mr-2">Source</span>
        {(['all', 'github', 'detector', 'agent'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            class={`text-xs px-3 py-1.5 rounded-full font-medium border transition-colors ${
              filter === f
                ? 'bg-[#175B37] text-white border-[#175B37]'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
            }`}
          >
            {f === 'all' ? 'Tous' : f === 'github' ? 'GitHub' : f === 'detector' ? 'Détecteur' : 'Agents'}
          </button>
        ))}
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cols.map((col) => {
          const items = filtered.filter((i) => i.kanbanColumn === col.id);
          return (
            <div
              key={col.id}
              class="bg-gray-50/80 rounded-[1.25rem] border border-gray-100 p-3 min-h-[200px] flex flex-col"
            >
              <div class="flex items-center justify-between mb-2 px-1">
                <div>
                  <h4 class="text-sm font-bold text-gray-900">{col.title}</h4>
                  <p class="text-[10px] text-gray-400">{col.desc}</p>
                </div>
                <span class="text-xs font-mono bg-white px-2 py-0.5 rounded-full border border-gray-100">{items.length}</span>
              </div>
              <div class="flex-1 space-y-2 overflow-y-auto max-h-[480px] pr-1">
                {items.length === 0 ? (
                  <p class="text-xs text-gray-400 italic px-2 py-6 text-center">Rien ici.</p>
                ) : (
                  items.map((i) => {
                    const sc = COL_SOURCE[i.source];
                    return (
                      <button
                        type="button"
                        key={i.id}
                        onClick={() => window.__openWorkDetail?.('issue', i.id)}
                        class="w-full text-left bg-white rounded-xl border border-gray-100 shadow-sm p-3 hover:border-[#175B37]/40 hover:shadow transition-all group"
                      >
                        <div class="flex items-start justify-between gap-2">
                          <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1.5 flex-wrap">
                              <span class={`text-[9px] font-bold px-1.5 py-0.5 rounded ${sc.bg} ${sc.text}`}>{sc.label}</span>
                              <span class="text-[10px] text-gray-400 truncate">{i.projectName}</span>
                            </div>
                            <p class="text-xs font-medium text-gray-800 mt-1 line-clamp-2 group-hover:text-[#175B37]">
                              {i.title}
                            </p>
                            <p class="text-[10px] font-mono text-gray-400 mt-0.5">{i.errorType}</p>
                          </div>
                          <Sparkline values={i.sparkline || [0, 0, 0, 0, 0, 0, 0]} />
                        </div>
                        <div class="flex items-center justify-between mt-2 text-[10px] text-gray-500">
                          <span class="truncate max-w-[120px]">{i.linkedTask?.agentId || i.assigneeAgentId || '—'}</span>
                          <span class="font-mono text-[9px]">#{i.id}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

declare global {
  interface Window {
    __openWorkDetail?: (type: string, id: number) => void;
  }
}
