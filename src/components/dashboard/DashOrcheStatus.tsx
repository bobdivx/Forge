import { useState, useEffect, useRef } from 'preact/hooks';

type Totals = { open: number; inProgress: number; resolved: number } | null;

export default function DashOrcheStatus() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const [totals, setTotals] = useState<Totals>(null);

  useEffect(() => {
    // Combiner issues + demandes (Request via agent-proposals) pour un vrai taux de progression
    Promise.all([
      fetch('/api/agent-issues').then((r) => r.json()).catch(() => ({ issues: [] })),
      fetch('/api/agent-proposals').then((r) => r.json()).catch(() => ({ requests: [] })),
    ]).then(([issueData, reqData]) => {
      const issues: any[] = Array.isArray(issueData.issues) ? issueData.issues : [];
      const requests: any[] = Array.isArray(reqData.requests) ? reqData.requests : [];
      const all = [...issues, ...requests];
      setTotals({
        open: all.filter((i) => ['open', 'pending'].includes(String(i.status))).length,
        inProgress: all.filter((i) => i.status === 'in_progress').length,
        resolved: all.filter((i) => ['resolved', 'completed', 'installed'].includes(String(i.status))).length,
      });
    }).catch(() => setTotals({ open: 0, inProgress: 0, resolved: 0 }));
  }, []);

  useEffect(() => {
    if (!totals || !canvasRef.current) return;
      const total = totals.open + totals.inProgress + totals.resolved;
        const pct = total > 0 ? Math.round((totals.resolved / total) * 100) : 0;
    import('chart.js/auto').then(({ default: Chart }) => {
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvasRef.current!, {
        type: 'doughnut',
        data: {
          labels: ['Résolues', 'En attente'],
          datasets: [{
            data: [pct, 100 - pct],
            backgroundColor: ['#175B37', '#E5E7EB'],
            borderWidth: 0,
            cutout: '75%',
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          rotation: 225,
          circumference: 270,
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
          },
        },
      });
    });
    return () => { chartRef.current?.destroy(); };
  }, [totals]);

  const total = totals ? totals.open + totals.inProgress + totals.resolved : 0;
  const pct = total > 0 ? Math.round(((totals?.resolved ?? 0) / total) * 100) : 0;

  return (
    <div class="bg-white p-6 rounded-[1.5rem] shadow-sm flex flex-col justify-between">
      <h3 class="font-semibold text-gray-800">Progression</h3>

      <div class="relative mt-4" style="height:160px;display:flex;align-items:center;justify-content:center;">
        {!totals ? (
          <div class="w-40 h-40 rounded-full bg-gray-100 animate-pulse" />
        ) : (
          <>
            <canvas ref={canvasRef} style="position:absolute;inset:0;width:100%;height:100%" />
            <div class="absolute inset-0 flex flex-col items-center justify-center" style="padding-top:2rem">
              <span class="text-4xl font-bold text-gray-800">{total === 0 ? '—' : `${pct}%`}</span>
              <span class="text-[10px] text-gray-400">{total === 0 ? 'Aucune tâche' : 'Tâches résolues'}</span>
            </div>
          </>
        )}
      </div>

      <div class="flex justify-center gap-4 mt-6 text-[10px] font-medium text-gray-500">
        <div class="flex items-center gap-1">
          <div class="w-2.5 h-2.5 rounded-full" style="background:#175B37" />
          Résolus
        </div>
        <div class="flex items-center gap-1">
          <div class="w-2.5 h-2.5 rounded-full" style="background:#3BAE61" />
          En cours
        </div>
        <div class="flex items-center gap-1">
          <div class="w-2.5 h-2.5 rounded-full bg-gray-200" />
          En attente
        </div>
      </div>
    </div>
  );
}
