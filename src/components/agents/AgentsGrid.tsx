import { useState, useEffect, useMemo } from 'preact/hooks';
import AgentCard from './AgentCard';
import AgentActivityChart from './AgentActivityChart';
import TabBar from '../ui/TabBar';
import {
  buildAgentTeamProfile,
  mergeOpenClawTeamProfile,
  type AgentTeamProfile,
  type OpenClawAgentProfileRow,
} from '../../lib/agent-profile';

type Agent = {
  id: string;
  name: string;
  status: string;
  model: string;
  contextTokens?: number | null;
  totalTokens?: number;
  estimatedCostUsd?: number;
  runtimeMs?: number;
  lastSeen?: string;
  lastSeenMs?: number;
  raw?: { offline?: boolean; disabledInDb?: boolean };
};

type TaskStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
};

function buildChartData(agents: Agent[], taskStats: Record<string, TaskStats>, teamProfiles: Record<string, AgentTeamProfile>) {
  /** Palette alignée Forge (vert marque + variantes lisibles sur fond blanc) */
  const CHART_COLORS = [
    '#175B37', '#3BAE61', '#2d8a4a', '#5ec986', '#134a2d', '#6b7280', '#9ca3af', '#374151',
  ];
  const labels = agents.map((a) => {
    const p = teamProfiles[a.id] ?? buildAgentTeamProfile(a);
    const full = (p.displayName || a.name).trim() || a.id;
    return full.length > 14 ? `${full.slice(0, 13)}…` : full;
  });
  const barData = {
    labels,
    datasets: [
      {
        label: 'Tâches totales',
        data: agents.map((a) => taskStats[a.id]?.total ?? 0),
        backgroundColor: agents.map((_, i) => CHART_COLORS[i % CHART_COLORS.length] + '99'),
      },
    ],
  };
  const allStats = Object.values(taskStats);
  const totals = allStats.reduce(
    (acc, s) => {
      acc.pending += s.pending;
      acc.running += s.running;
      acc.completed += s.completed;
      acc.failed += s.failed;
      return acc;
    },
    { pending: 0, running: 0, completed: 0, failed: 0 },
  );
  const doughnutData = {
    labels: ['En attente', 'En cours', 'Terminées', 'Erreurs'],
    datasets: [
      {
        data: [totals.pending, totals.running, totals.completed, totals.failed],
        backgroundColor: ['#EAB308', '#2563EB', '#3BAE61', '#EF4444'],
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };
  return { barData, doughnutData };
}

export default function AgentsGrid() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [ocProfiles, setOcProfiles] = useState<Record<string, OpenClawAgentProfileRow>>({});
  const [taskStats, setTaskStats] = useState<Record<string, TaskStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'idle'>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const load = () => {
      Promise.all([fetch('/api/agents'), fetch('/api/openclaw-agent-profiles')])
        .then(([r1, r2]) => Promise.all([r1.json(), r2.json().catch(() => ({}))]))
        .then(([data, pr]) => {
          setAgents(Array.isArray(data.agents) ? data.agents : Array.isArray(data) ? data : []);
          setTaskStats(data.taskStats ?? {});
          const gwErr = typeof data.gatewayError === 'string' && data.gatewayError ? data.gatewayError : null;
          setError(gwErr);
          if (pr?.profiles && typeof pr.profiles === 'object') {
            const next: Record<string, OpenClawAgentProfileRow> = {};
            for (const [k, v] of Object.entries(pr.profiles as Record<string, unknown>)) {
              if (v && typeof v === 'object') next[k] = v as OpenClawAgentProfileRow;
            }
            setOcProfiles(next);
          }
        })
        .catch(() => setError('Impossible de contacter le gateway OpenClaw.'))
        .finally(() => setLoading(false));
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const teamProfiles = useMemo(() => {
    const map: Record<string, AgentTeamProfile> = {};
    for (const a of agents) {
      map[a.id] = mergeOpenClawTeamProfile(a, ocProfiles[a.id] ?? null);
    }
    return map;
  }, [agents, ocProfiles]);

  const activeCount = agents.filter((a) => a.status === 'actif').length;
  const { barData, doughnutData } = buildChartData(agents, taskStats, teamProfiles);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (filter === 'active' && a.status !== 'actif') return false;
      if (filter === 'idle' && a.status === 'actif') return false;
      if (!q) return true;
      const p = teamProfiles[a.id] ?? buildAgentTeamProfile(a);
      return (
        a.name.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        (p.bio && p.bio.toLowerCase().includes(q))
      );
    });
  }, [agents, filter, query, teamProfiles]);

  if (loading) {
    return (
      <div class="space-y-8">
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {[1, 2].map((i) => (
            <div key={i} class="h-48 animate-pulse rounded-[1.5rem] border border-gray-100 bg-white shadow-sm" />
          ))}
        </div>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} class="h-64 animate-pulse rounded-[1.5rem] border border-gray-100 bg-white shadow-sm" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-8">
      <AgentActivityChart barData={barData} doughnutData={doughnutData} />

      <div class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span class="text-sm text-gray-500">
          <span class="font-semibold text-gray-900">{agents.length}</span> session(s) OpenClaw —{' '}
          <span class="font-semibold" style={{ color: '#3BAE61' }}>
            {activeCount}
          </span>{' '}
          actif(s)
        </span>
        <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <label class="relative block w-full sm:w-52">
            <span class="sr-only">Filtrer les agents</span>
            <svg
              class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              class="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-xs text-gray-800 outline-none transition focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15"
              placeholder="Rechercher (nom, rôle, session…)"
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </label>
          <TabBar
            className="shrink-0"
            tone="forge"
            tabs={[
              { id: 'all', label: 'Tous' },
              { id: 'active', label: 'Actifs' },
              { id: 'idle', label: 'Veille' },
            ]}
            active={filter}
            onChange={(id) => setFilter(id as 'all' | 'active' | 'idle')}
          />
        </div>
      </div>

      {error && (
        <div class="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error} — vérifiez le token OpenClaw dans les{' '}
          <a href="/settings" class="font-medium underline" style={{ color: '#175B37' }}>
            paramètres
          </a>
          .
        </div>
      )}

      {filtered.length > 0 ? (
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => (
            <AgentCard key={agent.id} agent={agent} taskStats={taskStats[agent.id]} teamProfile={teamProfiles[agent.id]!} />
          ))}
        </div>
      ) : (
        <div class="rounded-[1.5rem] border border-gray-100 bg-white p-12 text-center shadow-sm">
          <p class="text-sm text-gray-500">
            {filter !== 'all' || query.trim()
              ? 'Aucun agent ne correspond à ce filtre ou à cette recherche.'
              : 'Aucune session OpenClaw. Vérifiez que le gateway est démarré et le token configuré.'}
          </p>
        </div>
      )}
    </div>
  );
}
