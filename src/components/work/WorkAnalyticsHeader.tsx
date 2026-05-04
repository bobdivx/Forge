import type { RefObject } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';

type OverviewPayload = {
  ok: boolean;
  charts?: {
    byProject: Record<string, number>;
    byType: Record<string, number>;
    bySource: Record<string, number>;
    thirtySeries: { date: string; opened: number; resolved: number }[];
  };
  error?: string;
};

const tooltipLight = {
  backgroundColor: '#ffffff',
  titleColor: '#374151',
  bodyColor: '#4b5563',
  borderColor: '#e5e7eb',
  borderWidth: 1,
  padding: 10,
  cornerRadius: 12,
  displayColors: true,
};

const COLORS = ['#175B37', '#3BAE61', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9', '#EC4899', '#64748B'];

function useChart(
  canvasRef: RefObject<HTMLCanvasElement>,
  type: 'doughnut' | 'line',
  data: unknown,
  deps: unknown,
) {
  const chartRef = useRef<{ destroy: () => void } | null>(null);
  useEffect(() => {
    if (!canvasRef.current || !data) return;
    let cancelled = false;
    import('chart.js/auto').then(({ default: Chart }) => {
      if (cancelled || !canvasRef.current) return;
      chartRef.current?.destroy();
      chartRef.current = new Chart(canvasRef.current, {
        type,
        data: data as any,
        options:
          type === 'line'
            ? {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' as const }, tooltip: { ...tooltipLight } },
                scales: {
                  x: { grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#6b7280', maxRotation: 0 } },
                  y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#6b7280' } },
                },
              }
            : {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'bottom' as const }, tooltip: { ...tooltipLight } },
              },
      } as any);
    });
    return () => {
      cancelled = true;
      chartRef.current?.destroy();
    };
  }, [canvasRef, type, deps]);
}

export default function WorkAnalyticsHeader() {
  const [data, setData] = useState<OverviewPayload | null>(null);
  const c1 = useRef<HTMLCanvasElement>(null);
  const c2 = useRef<HTMLCanvasElement>(null);
  const c3 = useRef<HTMLCanvasElement>(null);
  const c4 = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/work-overview')
      .then((r) => r.json())
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        if (alive) setData({ ok: false, error: 'Chargement' });
      });
    return () => {
      alive = false;
    };
  }, []);

  const dProject = useMemo(() => {
    const by = data?.charts?.byProject || {};
    const keys = Object.keys(by).sort((a, b) => (by[b] || 0) - (by[a] || 0)).slice(0, 8);
    return {
      labels: keys,
      datasets: [
        {
          data: keys.map((k) => by[k] || 0),
          backgroundColor: keys.map((_, i) => COLORS[i % COLORS.length]),
          borderWidth: 0,
        },
      ],
    };
  }, [data?.charts?.byProject]);

  const dType = useMemo(() => {
    const by = data?.charts?.byType || {};
    const keys = Object.keys(by);
    return {
      labels: keys,
      datasets: [
        {
          data: keys.map((k) => by[k] || 0),
          backgroundColor: keys.map((_, i) => COLORS[i % COLORS.length]),
          borderWidth: 0,
        },
      ],
    };
  }, [data?.charts?.byType]);

  const dSource = useMemo(() => {
    const by = data?.charts?.bySource || {};
    const labels = ['GitHub', 'Détecteur', 'Agents'];
    const keys = ['github', 'detector', 'agent'] as const;
    return {
      labels,
      datasets: [
        {
          data: keys.map((k) => by[k] || 0),
          backgroundColor: ['#0EA5E9', '#F59E0B', '#3BAE61'],
          borderWidth: 0,
        },
      ],
    };
  }, [data?.charts?.bySource]);

  const dLine = useMemo(() => {
    const s = data?.charts?.thirtySeries || [];
    return {
      labels: s.map((x) => x.date.slice(5)),
      datasets: [
        {
          label: 'Détectés',
          data: s.map((x) => x.opened),
          borderColor: '#EF4444',
          backgroundColor: 'rgba(239,68,68,0.1)',
          fill: true,
          tension: 0.3,
        },
        {
          label: 'Résolus',
          data: s.map((x) => x.resolved),
          borderColor: '#3BAE61',
          backgroundColor: 'rgba(59,174,97,0.1)',
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }, [data?.charts?.thirtySeries]);

  useChart(c1, 'doughnut', dProject, dProject);
  useChart(c2, 'doughnut', dType, dType);
  useChart(c3, 'doughnut', dSource, dSource);
  useChart(c4, 'line', dLine, dLine);

  if (data && data.ok === false) {
    return (
      <div class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {data.error || 'Erreur analytics'}
      </div>
    );
  }

  return (
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Par projet</p>
        <div class="h-56">
          <canvas ref={c1} class="max-h-full" />
        </div>
      </div>
      <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Par type</p>
        <div class="h-56">
          <canvas ref={c2} class="max-h-full" />
        </div>
      </div>
      <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5">
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Par source</p>
        <div class="h-56">
          <canvas ref={c3} class="max-h-full" />
        </div>
      </div>
      <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-5 lg:col-span-2">
        <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">30 jours — détectés vs résolus</p>
        <div class="h-64">
          <canvas ref={c4} class="max-h-full" />
        </div>
      </div>
    </div>
  );
}
