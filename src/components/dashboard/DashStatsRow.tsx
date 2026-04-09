import { useState, useEffect } from 'preact/hooks';
import { DashStat } from './DashStat';

type Props = { serverProjectTotal?: number };

export default function DashStatsRow({ serverProjectTotal }: Props) {
  const [data, setData] = useState<{
    projectCount: number;
    activeProjects: number;
    openIssues: number;
    openRequests: number;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [kpiRes, agentRes] = await Promise.all([fetch('/api/dashboard-kpis'), fetch('/api/agents')]);
        const kpi = kpiRes.ok ? await kpiRes.json() : {};
        const agentData = agentRes.ok ? await agentRes.json() : {};
        const agents: any[] = Array.isArray(agentData) ? agentData : (agentData.agents ?? []);
        const active = agents.filter((a: any) => a.status === 'actif').length;
        setData({
          projectCount: Math.max(kpi.projectCount ?? 0, serverProjectTotal ?? 0),
          activeProjects: active,
          openIssues: kpi.openAppIssues ?? 0,
          openRequests: kpi.openRequests ?? 0,
        });
      } catch { /* ignore */ }
    }
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [serverProjectTotal]);

  if (!data) {
    return (
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} class="h-40 rounded-[1.5rem] bg-white shadow-sm animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-5">
      <DashStat
        label="Total Projets"
        value={data.projectCount || serverProjectTotal || 0}
        sub="Augmenté ce mois"
        href="/apps"
        accent
      />
      <DashStat
        label="Projets terminés"
        value={data.openIssues === 0 ? data.projectCount : Math.max(0, data.projectCount - data.openRequests)}
        sub="Augmenté ce mois"
        href="/apps"
      />
      <DashStat
        label="Projets en cours"
        value={data.activeProjects || data.openRequests || 0}
        sub="Augmenté ce mois"
        href="/agents"
      />
      <DashStat
        label="En attente"
        value={data.openRequests}
        sub="En discussion"
        href="/work"
      />
    </div>
  );
}
