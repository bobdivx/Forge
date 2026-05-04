import { useEffect, useRef } from 'preact/hooks';

type TaskStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
};

type SwarmEvent = { at: string };

type Props = {
  taskStats: Record<string, TaskStats>;
  events: SwarmEvent[];
  agentCount: number;
};

const tooltipLight = {
  backgroundColor: '#ffffff',
  titleColor: '#374151',
  bodyColor: '#4b5563',
  borderColor: '#e5e7eb',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 12,
};

function aggregate(stats: Record<string, TaskStats>) {
  return Object.values(stats).reduce(
    (acc, s) => {
      acc.pending += s.pending;
      acc.running += s.running;
      acc.completed += s.completed;
      acc.failed += s.failed;
      acc.total += s.total;
      return acc;
    },
    { pending: 0, running: 0, completed: 0, failed: 0, total: 0 },
  );
}

function buildHourlyHeat(events: SwarmEvent[]): number[] {
  const buckets = new Array(24).fill(0);
  const now = Date.now();
  const start = now - 24 * 60 * 60 * 1000;
  for (const ev of events) {
    const t = new Date(ev.at).getTime();
    if (!Number.isFinite(t) || t < start || t > now) continue;
    const slot = Math.min(23, Math.floor(((t - start) / (24 * 60 * 60 * 1000)) * 24));
    buckets[slot] += 1;
  }
  return buckets;
}

function Radar({ taskStats, agentCount }: { taskStats: Record<string, TaskStats>; agentCount: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const a = aggregate(taskStats);
  const data = {
    labels: ['File', 'En cours', 'OK', 'Échecs', 'Agents'],
    datasets: [
      {
        label: 'Charge swarm',
        data: [
          Math.min(40, a.pending),
          Math.min(40, a.running),
          Math.min(40, a.completed),
          Math.min(40, a.failed),
          Math.min(40, Math.max(0, agentCount)),
        ],
        backgroundColor: 'rgba(23,91,55,0.12)',
        borderColor: '#175B37',
        borderWidth: 2,
        pointBackgroundColor: '#3BAE61',
      },
    ],
  };

  useEffect(() => {
    if (!ref.current) return;
    import('chart.js/auto').then(({ default: Chart }) => {
      chartRef.current?.destroy();
      chartRef.current = new Chart(ref.current!, {
        type: 'radar',
        data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            r: {
              beginAtZero: true,
              suggestedMax: 40,
              ticks: { stepSize: 10, color: '#9ca3af' },
              grid: { color: 'rgba(0,0,0,0.06)' },
              angleLines: { color: 'rgba(0,0,0,0.06)' },
              pointLabels: { color: '#4b5563', font: { size: 10 } },
            },
          },
          plugins: {
            legend: { display: false },
            tooltip: { ...tooltipLight },
          },
        },
      });
    });
    return () => {
      chartRef.current?.destroy();
    };
  }, [JSON.stringify(data.datasets)]);

  return (
    <div class="h-56">
      <canvas ref={ref} />
    </div>
  );
}

function Heat24({ events }: { events: SwarmEvent[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const hourly = buildHourlyHeat(events);
  const labels = hourly.map((_, i) => `${i}h`);

  const chartData = {
    labels,
    datasets: [
      {
        label: 'Événements (24 h)',
        data: hourly,
        backgroundColor: hourly.map((v) =>
          v === 0 ? 'rgba(156,163,175,0.25)' : 'rgba(59,174,97,0.55)',
        ),
        borderRadius: 6,
      },
    ],
  };

  useEffect(() => {
    if (!ref.current) return;
    import('chart.js/auto').then(({ default: Chart }) => {
      chartRef.current?.destroy();
      chartRef.current = new Chart(ref.current!, {
        type: 'bar',
        data: chartData,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { ...tooltipLight },
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: '#6b7280', maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
            },
            y: {
              beginAtZero: true,
              grid: { color: 'rgba(0,0,0,0.06)' },
              ticks: { color: '#6b7280', precision: 0 },
            },
          },
        },
      });
    });
    return () => {
      chartRef.current?.destroy();
    };
  }, [JSON.stringify(hourly)]);

  return (
    <div class="h-44">
      <canvas ref={ref} />
    </div>
  );
}

export default function AgentsSwarmHeatRadar({ taskStats, events, agentCount }: Props) {
  return (
    <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div class="rounded-[1.25rem] border border-gray-100 bg-white p-4 shadow-sm">
        <p class="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Radar charge globale</p>
        <Radar taskStats={taskStats} agentCount={agentCount} />
      </div>
      <div class="rounded-[1.25rem] border border-gray-100 bg-white p-4 shadow-sm">
        <p class="mb-2 text-[10px] font-bold uppercase tracking-widest text-gray-400">Activité flux (24 h)</p>
        <Heat24 events={events} />
      </div>
    </div>
  );
}
