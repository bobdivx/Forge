import { useState, useEffect } from 'preact/hooks';
import AgentCard from './AgentCard';
import AgentActivityChart from './AgentActivityChart';

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
  const CHART_COLORS = [
    '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b',
    '#f43f5e', '#06b6d4', '#6366f1', '#84cc16',
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
    datasets: [{ data: [totals.pending, totals.running, totals.completed, totals.failed], backgroundColor: ['#f59e0b', '#3b82f6', '#10b981', '#f43f5e'] }],
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
          {[1, 2].map((i) => <div key={i} class="h-48 bg-slate-900 border border-slate-800 rounded-xl animate-pulse" />)}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => <div key={i} class="h-64 bg-slate-900 border border-slate-800 rounded-2xl animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-8">
      <AgentActivityChart barData={barData} doughnutData={doughnutData} />

      <div class="flex items-center justify-between flex-wrap gap-4">
        <span class="text-sm text-slate-400">
          <span class="text-white font-semibold">{agents.length}</span> session(s) —{' '}
          <span class="text-emerald-400 font-semibold">{activeCount}</span> actif(s)
        </span>
        <div class="flex gap-2">
          {(['all', 'active', 'idle'] as const).map((f) => (
            <button key={f} type="button" onClick={() => setFilter(f)} class={`text-xs px-3 py-1.5 rounded-lg border transition font-medium ${filter === f ? 'bg-blue-500/20 border-blue-500/40 text-blue-300' : 'bg-slate-900 border-slate-700 text-slate-400 hover:border-slate-600'}`}>
              {f === 'all' ? 'Tous' : f === 'active' ? 'Actifs' : 'Veille'}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-4 text-sm text-amber-200">
          {error} — vérifiez le token OpenClaw dans les <a href="/settings" class="underline">paramètres</a>.
        </div>
      )}

      {filtered.length > 0 ? (
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map((agent) => <AgentCard key={agent.id} agent={agent} taskStats={taskStats[agent.id]} />)}
        </div>
      ) : (
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <p class="text-slate-500 text-sm">
            {filter !== 'all' ? 'Aucun agent dans ce filtre.' : 'Aucune session OpenClaw. Vérifiez que le gateway est démarré et le token configuré.'}
          </p>
        </div>
      )}
    </div>
  );
}
