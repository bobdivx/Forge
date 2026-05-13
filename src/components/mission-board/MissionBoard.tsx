import { useEffect, useMemo, useState } from 'preact/hooks';

type Column = 'backlog' | 'triaged' | 'in_progress' | 'review' | 'done';
type Swimlane = 'bugs' | 'features' | 'tech';
type MissionSource = 'request' | 'app_issue' | 'tech_suggestion';

type MissionItem = {
  uid: string;
  source: MissionSource;
  sourceId: number;
  swimlane: Swimlane;
  column: Column;
  title: string;
  summary: string | null;
  projectId: number | null;
  projectName: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical' | null;
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
};

type Overview = {
  ok: boolean;
  items: MissionItem[];
  counts: Record<Column, number>;
  bySwimlane: Record<Swimlane, Record<Column, number>>;
  lastSync: string;
};

const COLUMNS: { id: Column; label: string }[] = [
  { id: 'backlog', label: 'Backlog' },
  { id: 'triaged', label: 'Triaged' },
  { id: 'in_progress', label: 'En cours' },
  { id: 'review', label: 'Revue' },
  { id: 'done', label: 'Terminé' },
];

const SWIMLANES: { id: Swimlane; label: string; tone: string }[] = [
  { id: 'bugs', label: 'Bugs', tone: 'border-rose-200 bg-rose-50/40' },
  { id: 'features', label: 'Fonctionnalités', tone: 'border-blue-200 bg-blue-50/40' },
  { id: 'tech', label: 'Veille tech', tone: 'border-emerald-200 bg-emerald-50/40' },
];

const SOURCE_LABEL: Record<MissionSource, { label: string; tone: string }> = {
  request: { label: 'Carnet', tone: 'bg-blue-100 text-blue-700' },
  app_issue: { label: 'Bug', tone: 'bg-rose-100 text-rose-700' },
  tech_suggestion: { label: 'Veille', tone: 'bg-emerald-100 text-emerald-700' },
};

const PRIORITY_TONE: Record<NonNullable<MissionItem['priority']>, string> = {
  critical: 'bg-rose-100 text-rose-800 border-rose-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-amber-100 text-amber-800 border-amber-200',
  low: 'bg-gray-100 text-gray-700 border-gray-200',
};

const REFRESH_MS = 20_000;

export default function MissionBoard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterSwimlane, setFilterSwimlane] = useState<Swimlane | 'all'>('all');
  const [dragUid, setDragUid] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      const res = await fetch('/api/mission-board');
      const data = (await res.json()) as Overview;
      setOverview(data);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    fetchOverview();
    const id = setInterval(fetchOverview, REFRESH_MS);
    return () => clearInterval(id);
  }, []);

  const projectOptions = useMemo(() => {
    if (!overview) return [] as string[];
    const set = new Set<string>();
    for (const it of overview.items) if (it.projectName) set.add(it.projectName);
    return Array.from(set).sort();
  }, [overview]);

  const items = useMemo(() => {
    if (!overview) return [] as MissionItem[];
    return overview.items.filter((it) => {
      if (filterProject !== 'all' && it.projectName !== filterProject) return false;
      if (filterSwimlane !== 'all' && it.swimlane !== filterSwimlane) return false;
      return true;
    });
  }, [overview, filterProject, filterSwimlane]);

  const visibleSwimlanes = filterSwimlane === 'all' ? SWIMLANES : SWIMLANES.filter((s) => s.id === filterSwimlane);

  const handleMove = async (uid: string, target: Column) => {
    setBusy(true);
    try {
      const res = await fetch('/api/mission-board/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'move', uid, target }),
      });
      const data = await res.json();
      if (!data.ok) setMessage(`Erreur : ${data.error || 'inconnue'}`);
      await fetchOverview();
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const handlePullNow = async () => {
    setBusy(true);
    try {
      const res = await fetch('/api/mission-board/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull_now', maxPromote: 5 }),
      });
      const data = await res.json();
      setMessage(data.ok ? `${data.promoted} tâche(s) lancée(s).` : `Erreur : ${data.error || 'inconnue'}`);
      await fetchOverview();
    } finally {
      setBusy(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  return (
    <div class="space-y-4">
      <header class="rounded-[1.5rem] bg-white border border-gray-100 shadow-sm p-5">
        <div class="flex flex-wrap items-start justify-between gap-4">
          <div class="flex-1 min-w-[280px]">
            <span class="text-[10px] font-black uppercase tracking-widest text-[#175B37]">Mission Board</span>
            <h1 class="text-xl font-bold text-gray-900 mt-1">Tableau partagé multi-agents</h1>
            <p class="text-sm text-gray-500 mt-1">
              Vue unifiée des bugs, demandes du carnet et veille tech. Les agents tirent en priorité les items
              en colonne « Triaged ».
            </p>
          </div>
          <div class="flex items-center gap-3">
            <select
              value={filterProject}
              onChange={(e) => setFilterProject((e.target as HTMLSelectElement).value)}
              class="text-xs border border-gray-200 rounded-full px-3 py-1.5"
            >
              <option value="all">Tous les projets</option>
              {projectOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
            <select
              value={filterSwimlane}
              onChange={(e) => setFilterSwimlane((e.target as HTMLSelectElement).value as Swimlane | 'all')}
              class="text-xs border border-gray-200 rounded-full px-3 py-1.5"
            >
              <option value="all">Toutes les voies</option>
              <option value="bugs">Bugs</option>
              <option value="features">Fonctionnalités</option>
              <option value="tech">Veille tech</option>
            </select>
            <button
              onClick={handlePullNow}
              disabled={busy}
              class="rounded-full bg-[#175B37] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {busy ? '…' : 'Tirer maintenant'}
            </button>
          </div>
        </div>
        {message && <div class="mt-3 text-xs text-emerald-700">{message}</div>}
        {overview && (
          <div class="mt-3 flex gap-4 text-[10px] uppercase tracking-wider text-gray-500">
            {COLUMNS.map((c) => (
              <span key={c.id}>
                {c.label} : <b class="text-gray-900">{overview.counts[c.id]}</b>
              </span>
            ))}
          </div>
        )}
      </header>

      <div class="space-y-4">
        {visibleSwimlanes.map((lane) => {
          const laneItems = items.filter((it) => it.swimlane === lane.id);
          return (
            <section key={lane.id} class={`rounded-[1.5rem] border ${lane.tone} p-3`}>
              <div class="flex items-center justify-between mb-3 px-2">
                <h2 class="text-sm font-bold text-gray-900">{lane.label}</h2>
                <span class="text-[10px] text-gray-500">{laneItems.length} item(s)</span>
              </div>
              <div class="grid grid-cols-5 gap-2 min-h-[180px]">
                {COLUMNS.map((col) => {
                  const colItems = laneItems.filter((it) => it.column === col.id);
                  return (
                    <div
                      key={col.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragUid) handleMove(dragUid, col.id);
                        setDragUid(null);
                      }}
                      class="bg-white rounded-xl border border-gray-100 p-2 space-y-1.5 min-h-[180px]"
                    >
                      <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-gray-500 px-1">
                        <span>{col.label}</span>
                        <span class="bg-gray-100 text-gray-700 rounded-full px-2 py-0.5">{colItems.length}</span>
                      </div>
                      {colItems.length === 0 ? (
                        <div class="text-[10px] text-gray-300 text-center py-6">Vide</div>
                      ) : (
                        colItems.map((it) => {
                          const src = SOURCE_LABEL[it.source];
                          return (
                            <div
                              key={it.uid}
                              draggable
                              onDragStart={() => setDragUid(it.uid)}
                              onDragEnd={() => setDragUid(null)}
                              class="bg-white border border-gray-100 rounded-lg p-2 hover:border-[#175B37] transition-colors cursor-grab"
                              title={it.summary ?? ''}
                            >
                              <div class="flex items-center gap-1 mb-1 flex-wrap">
                                <span class={`text-[9px] font-bold px-1.5 py-0.5 rounded ${src.tone}`}>
                                  {src.label}
                                </span>
                                {it.priority && (
                                  <span class={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${PRIORITY_TONE[it.priority]}`}>
                                    {it.priority.toUpperCase()}
                                  </span>
                                )}
                                {it.projectName && (
                                  <span class="text-[9px] text-gray-500 truncate">{it.projectName}</span>
                                )}
                              </div>
                              <div class="text-[11px] font-semibold text-gray-900 line-clamp-2">{it.title}</div>
                              {it.assignee && (
                                <div class="text-[9px] text-gray-500 mt-1">→ {it.assignee}</div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
