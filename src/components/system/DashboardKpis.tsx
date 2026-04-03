import { useState, useEffect } from 'preact/hooks';

type Kpi = { label: string; value: number | string; sub?: string; color: 'blue' | 'emerald' | 'violet' | 'amber'; icon: string; };

function KpiCard({ kpi }: { kpi: Kpi }) {
  const palette = {
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: 'text-blue-400', value: 'text-blue-300' },
    emerald: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: 'text-emerald-400', value: 'text-emerald-300' },
    violet: { bg: 'bg-violet-500/10', border: 'border-violet-500/20', icon: 'text-violet-400', value: 'text-violet-300' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: 'text-amber-400', value: 'text-amber-300' },
  };
  const c = palette[kpi.color];
  return (
    <div class={`rounded-xl border ${c.border} ${c.bg} p-5 flex items-center gap-4`}>
      <div class={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center ${c.bg} border ${c.border}`}>
        <svg class={`w-6 h-6 ${c.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={kpi.icon} />
        </svg>
      </div>
      <div class="min-w-0">
        <div class={`text-2xl font-bold tabular-nums ${c.value}`}>{kpi.value}</div>
        <div class="text-xs font-medium text-slate-400 mt-0.5 truncate">{kpi.label}</div>
        {kpi.sub && <div class="text-[10px] text-slate-600 mt-0.5">{kpi.sub}</div>}
      </div>
    </div>
  );
}

export default function DashboardKpis() {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [agentRes, kpiRes] = await Promise.all([fetch('/api/agents'), fetch('/api/dashboard-kpis')]);
        const agentData = await agentRes.json();
        const kpiData = kpiRes.ok ? await kpiRes.json() : {};
        const agents: any[] = Array.isArray(agentData) ? agentData : (agentData.agents ?? []);
        const active = agents.filter((a: any) => a.status === 'actif').length;
        setKpis([
          { label: 'Applications', value: kpiData.projectCount ?? '—', sub: 'projets en base', color: 'blue', icon: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-10.5v9' },
          { label: 'Agents actifs', value: active, sub: `${agents.length} session(s) total`, color: 'emerald', icon: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z' },
          { label: "Tâches aujourd'hui", value: kpiData.tasksToday ?? '—', sub: `${kpiData.tasksTotal ?? 0} au total`, color: 'violet', icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
          { label: 'Demandes ouvertes', value: kpiData.openRequests ?? '—', sub: 'statut pending', color: 'amber', icon: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63' },
        ]);
      } catch { /* silently ignore */ } finally { setLoading(false); }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <div key={i} class="rounded-xl border border-slate-800 bg-slate-900 p-5 h-24 animate-pulse" />)}
      </div>
    );
  }
  return (
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map((kpi) => <KpiCard key={kpi.label} kpi={kpi} />)}
    </div>
  );
}
