import { useState, useEffect } from 'preact/hooks';
import { logForgeZimaOS } from '../../lib/forge-zimaos-console';

type Kpi = { label: string; value: number | string; sub?: string; color: 'blue' | 'violet' | 'amber'; icon: string };

function KpiCard({ kpi }: { kpi: Kpi }) {
  const palette = {
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/20', icon: 'text-blue-400', value: 'text-blue-300' },
    violet: { bg: 'bg-violet-500/10', border: 'border-violet-500/20', icon: 'text-violet-400', value: 'text-violet-300' },
    amber: { bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: 'text-amber-400', value: 'text-amber-300' },
  };
  const c = palette[kpi.color];
  return (
    <div class={`rounded-xl border ${c.border} ${c.bg} p-5 sm:p-6 flex items-center gap-4 sm:gap-5 w-full min-w-0`}>
      <div class={`shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${c.bg} border ${c.border}`}>
        <svg class={`w-5 h-5 sm:w-6 sm:h-6 ${c.icon}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d={kpi.icon} />
        </svg>
      </div>
      <div class="min-w-0 flex-1">
        <div class={`text-xl sm:text-2xl font-bold tabular-nums ${c.value}`}>{kpi.value}</div>
        <div class="text-xs font-medium text-slate-400 mt-0.5">{kpi.label}</div>
        {kpi.sub && <div class="text-[10px] text-slate-600 mt-0.5 leading-relaxed">{kpi.sub}</div>}
      </div>
    </div>
  );
}

/** Mobile / tablette &lt; lg : cartes empilées, pleine largeur (plus fiable qu’un scroll horizontal). */
function KpiMobileStack({ kpis }: { kpis: Kpi[] }) {
  return (
    <div class="lg:hidden flex flex-col gap-5 sm:gap-6 w-full min-w-0" role="list" aria-label="Indicateurs clés">
      {kpis.map((kpi) => (
        <div key={kpi.label} class="w-full min-w-0" role="listitem">
          <KpiCard kpi={kpi} />
        </div>
      ))}
    </div>
  );
}

type DashboardKpisProps = {
  /** Comptage SSR table Project (secours si KPI API renvoie 0 à tort) */
  serverProjectTotal?: number;
};

function mergeProjectCount(apiVal: unknown, serverTotal?: number): number | string {
  const apiN = typeof apiVal === 'number' && Number.isFinite(apiVal) ? apiVal : NaN;
  const ssrN = typeof serverTotal === 'number' && Number.isFinite(serverTotal) ? serverTotal : NaN;
  if (!Number.isFinite(apiN) && !Number.isFinite(ssrN)) return '—';
  return Math.max(Number.isFinite(apiN) ? apiN : 0, Number.isFinite(ssrN) ? ssrN : 0);
}

export default function DashboardKpis({ serverProjectTotal }: DashboardKpisProps) {
  const [kpis, setKpis] = useState<Kpi[]>([]);
  const [loading, setLoading] = useState(true);
  const [gatewayHint, setGatewayHint] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [agentRes, kpiRes] = await Promise.all([fetch('/api/agents'), fetch('/api/dashboard-kpis')]);
        const agentData = await agentRes.json();
        const kpiData = kpiRes.ok ? await kpiRes.json() : {};
        const agents: any[] = Array.isArray(agentData) ? agentData : (agentData.agents ?? []);
        const gwErr = typeof agentData.gatewayError === 'string' ? agentData.gatewayError : '';
        const gwVia = typeof agentData.gatewayVia === 'string' ? agentData.gatewayVia : '';
        if (gwErr) {
          setGatewayHint(
            `${gwErr}${gwVia ? ` (via ${gwVia})` : ''}. Vérifiez l’URL / token ZimaOS dans Paramètres — l’URL doit être joignable depuis le serveur qui exécute Forge (pas seulement depuis votre navigateur).`
          );
        } else {
          setGatewayHint(null);
        }
        const dbg = agentData.zimaosDebug;
        if (dbg && typeof dbg === 'object') {
          logForgeZimaOS('GET /api/agents (tableau KPIs)', {
            ...dbg,
            agentsCount: agents.length,
            gatewayError: gwErr || null,
            gatewayVia: gwVia || null,
          });
        }

        setKpis([
          {
            label: 'Applications',
            value: mergeProjectCount(kpiData.projectCount, serverProjectTotal),
            sub: 'projets en base',
            color: 'blue',
            icon: 'M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-10.5v9',
          },
          {
            label: 'Tâches (base Forge)',
            value: kpiData.tasksToday ?? '—',
            sub: `${kpiData.tasksTotal ?? 0} AgentTask · file agents : ${typeof kpiData.openAppIssues === 'number' ? kpiData.openAppIssues : '—'} anomalie(s) ouverte(s), ${typeof kpiData.openDependencyRequests === 'number' ? kpiData.openDependencyRequests : '—'} dépendance(s)`,
            color: 'violet',
            icon: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
          },
          {
            label: 'Demandes (table Request)',
            value: kpiData.openRequests ?? '—',
            sub: 'Demandes produit pending — distinct des anomalies / deps agents (voir file orchestration)',
            color: 'amber',
            icon: 'M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63',
          },
        ]);
      } catch {
        /* silently ignore */
      } finally {
        setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [serverProjectTotal]);

  if (loading) {
    return (
      <div class="space-y-6 min-w-0">
        <div class="lg:hidden flex flex-col gap-5 sm:gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} class="h-[5.25rem] rounded-xl border border-slate-800 bg-slate-900 animate-pulse" />
          ))}
        </div>
        <div class="hidden lg:grid lg:grid-cols-3 gap-6 xl:gap-8">
          {[1, 2, 3].map((i) => (
            <div key={i} class="rounded-xl border border-slate-800 bg-slate-900 p-5 h-24 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-6 min-w-0">
      {gatewayHint && (
        <div
          class="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3 py-3 sm:px-4 text-xs sm:text-sm text-amber-100/95 leading-relaxed"
          role="status"
        >
          <span class="font-semibold text-amber-200">ZimaOS : </span>
          {gatewayHint}
        </div>
      )}
      <KpiMobileStack kpis={kpis} />
      <div class="hidden lg:grid lg:grid-cols-3 gap-6 xl:gap-8 min-w-0">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} kpi={kpi} />
        ))}
      </div>
    </div>
  );
}
