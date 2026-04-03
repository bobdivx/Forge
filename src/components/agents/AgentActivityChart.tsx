import { useEffect, useRef } from 'preact/hooks';

type BarData = {
  labels: string[];
  datasets: { label: string; data: number[]; backgroundColor: string }[];
};

type DoughnutData = {
  labels: string[];
  datasets: { data: number[]; backgroundColor: string[] }[];
};

type Props = { barData: BarData; doughnutData: DoughnutData };

function BarChart({ data }: { data: BarData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  useEffect(() => {
    if (!ref.current) return;
    import('chart.js/auto').then(({ default: Chart }) => {
      chartRef.current?.destroy();
      chartRef.current = new Chart(ref.current!, {
        type: 'bar', data,
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgb(15 23 42)', titleColor: '#94a3b8', bodyColor: '#e2e8f0', borderColor: 'rgb(51 65 85)', borderWidth: 1 } },
          scales: {
            x: { grid: { color: 'rgba(51,65,85,0.4)' }, ticks: { color: '#64748b', font: { size: 10 } } },
            y: { grid: { color: 'rgba(51,65,85,0.4)' }, ticks: { color: '#64748b', font: { size: 10 } }, beginAtZero: true },
          },
        },
      });
    });
    return () => { chartRef.current?.destroy(); };
  }, [JSON.stringify(data)]);
  return <canvas ref={ref} />;
}

function DoughnutChart({ data }: { data: DoughnutData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  useEffect(() => {
    if (!ref.current) return;
    import('chart.js/auto').then(({ default: Chart }) => {
      chartRef.current?.destroy();
      chartRef.current = new Chart(ref.current!, {
        type: 'doughnut', data,
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '70%',
          plugins: {
            legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12, padding: 12 } },
            tooltip: { backgroundColor: 'rgb(15 23 42)', titleColor: '#94a3b8', bodyColor: '#e2e8f0', borderColor: 'rgb(51 65 85)', borderWidth: 1 },
          },
        },
      });
    });
    return () => { chartRef.current?.destroy(); };
  }, [JSON.stringify(data)]);
  return <canvas ref={ref} />;
}

export default function AgentActivityChart({ barData, doughnutData }: Props) {
  const hasBarData = barData.labels.length > 0 && barData.datasets.some((d) => d.data.some((v) => v > 0));
  const hasDoughnut = doughnutData.datasets[0]?.data.some((v) => v > 0);
  return (
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h4 class="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Tâches par agent</h4>
        {hasBarData ? <div class="h-52"><BarChart data={barData} /></div> : <div class="h-52 flex items-center justify-center text-slate-600 text-sm italic">Aucune donnée disponible</div>}
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h4 class="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4">Répartition statuts</h4>
        {hasDoughnut ? <div class="h-52"><DoughnutChart data={doughnutData} /></div> : <div class="h-52 flex items-center justify-center text-slate-600 text-sm italic">Aucune tâche en base</div>}
      </div>
    </div>
  );
}
