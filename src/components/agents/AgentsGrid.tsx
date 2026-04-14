import { useState, useEffect } from 'preact/hooks';
import AgentCard from './AgentCard';
import AgentActivityChart from './AgentActivityChart';
import TabBar from '../ui/TabBar';

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
};

type TaskStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
};

function buildChartData(agents: Agent[], taskStats: Record<string, TaskStats>) {
  /** Palette alignée Forge (vert marque + variantes lisibles sur fond blanc) */
  const CHART_COLORS = [
    '#175B37', '#3BAE61', '#2d8a4a', '#5ec986', '#134a2d', '#6b7280', '#9ca3af', '#374151',
  ];
  const labels = agents.map((a) => {
    const n = a.name.replace('telegram:g-agent-', '').replace('agent:', '').replace(':main', '').split(':')[0].slice(0, 14);
    return n.charAt(0).toUpperCase() + n.slice(1);
  });
  const barData = {
    labels,
    datasets: [{ label: 'Tâches totales', data: agents.map((a) => taskStats[a.id]?.total ?? 0), backgroundColor: agents.map((_, i) => CHART_COLORS[i % CHART_COLORS.length] + '99') }],
  };
  const allStats = Object.values(taskStats);
  const totals = allStats.reduce((acc, s) => { acc.pending += s.pending; acc.running += s.running; acc.completed += s.completed; acc.failed += s.failed; return acc; }, { pending: 0, running: 0, completed: 0, failed: 0 });
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
  const [taskStats, setTaskStats] = useState<Record<string, TaskStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'idle'>('all');

  useEffect(() => {
    const load = () => {
      fetch('/api/agents')
        .then((r) => r.json())
        .then((data) => {
          setAgents(Array.isArray(data.agents) ? data.agents : Array.isArray(data) ? data : []);
          setTaskStats(data.taskStats ?? {});
          const gwErr = typeof data.gatewayError === 'string' && data.gatewayError ? data.gatewayError : null;
          setError(gwErr);
        })
        .catch(() => setError('Impossible de contacter le gateway OpenClaw.'))
        .finally(() => setLoading(false));
    };
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  const filtered = agents.filter((a) => filter === 'all' ? true : filter === 'active' ? a.status === 'actif' : a.status !== 'actif');
  const activeCount = agents.filter((a) => a.status === 'actif').length;
  const { barData, doughnutData } = buildChartData(agents, taskStats);

  if (loading) {
    return (
      <div class="space-y-8">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {[1, 2].map((i) => (
            <div key={i} class="h-48 bg-white border border-gray-100 rounded-[1.5rem] shadow-sm animate-pulse" />
          ))}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} class="h-64 bg-white border border-gray-100 rounded-[1.5rem] shadow-sm animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-8">
      <AgentActivityChart barData={barData} doughnutData={doughnutData} />

      <div class="flex items-center justify-between flex-wrap gap-4">
        <span class="text-sm text-gray-500">
          <span class="text-gray-900 font-semibold">{agents.length}</span> session(s) —{' '}
          <span class="font-semibold" style={{ color: '#3BAE61' }}>{activeCount}</span> actif(s)
        </span>
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

      {error && (
        <div class="bg-amber-50 border border-amber-200 rounded-[1.5rem] p-4 text-sm text-amber-900">
          {error} — vérifiez le token OpenClaw dans les{' '}
          <a href="/settings" class="underline font-medium" style={{ color: '#175B37' }}>
            paramètres
          </a>
          .
        </div>
      )}

      {filtered.length > 0 ? (
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((agent) => <AgentCard key={agent.id} agent={agent} taskStats={taskStats[agent.id]} />)}
        </div>
      ) : (
        <div class="bg-white border border-gray-100 rounded-[1.5rem] shadow-sm p-12 text-center">
          <p class="text-gray-500 text-sm">
            {filter !== 'all' ? 'Aucun agent dans ce filtre.' : 'Aucune session OpenClaw. Vérifiez que le gateway est démarré et le token configuré.'}
          </p>
        </div>
      )}
    </div>
  );
}
