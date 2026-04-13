import { useEffect, useRef } from 'preact/hooks';

type BarData = {
  labels: string[];
  datasets: { label: string; data: number[]; backgroundColor: string | string[] }[];
};

type DoughnutData = {
  labels: string[];
  datasets: {
    data: number[];
    backgroundColor: string[];
    borderColor?: string;
    borderWidth?: number;
  }[];
};

type Props = { barData: BarData; doughnutData: DoughnutData };

const CARD =
  'bg-white border border-gray-100 rounded-[1.5rem] shadow-sm p-5';
const TITLE = 'text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4';
const EMPTY = 'h-52 flex items-center justify-center text-gray-400 text-sm';

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

function BarChart({ data }: { data: BarData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  useEffect(() => {
    if (!ref.current) return;
    import('chart.js/auto').then(({ default: Chart }) => {
      chartRef.current?.destroy();
      chartRef.current = new Chart(ref.current!, {
        type: 'bar',
        data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: { ...tooltipLight },
          },
          scales: {
            x: {
              grid: { color: 'rgba(0,0,0,0.06)' },
              ticks: { color: '#6b7280', font: { size: 10 } },
            },
            y: {
              grid: { color: 'rgba(0,0,0,0.06)' },
              ticks: { color: '#6b7280', font: { size: 10 } },
              beginAtZero: true,
            },
          },
        },
      });
    });
    return () => {
      chartRef.current?.destroy();
    };
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
        type: 'doughnut',
        data,
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
            legend: {
              position: 'right',
              labels: {
                color: '#6b7280',
                font: { size: 11 },
                boxWidth: 12,
                padding: 12,
                usePointStyle: true,
              },
            },
            tooltip: { ...tooltipLight },
          },
        },
      });
    });
    return () => {
      chartRef.current?.destroy();
    };
  }, [JSON.stringify(data)]);
  return <canvas ref={ref} />;
}

export default function AgentActivityChart({ barData, doughnutData }: Props) {
  const hasBarData = barData.labels.length > 0 && barData.datasets.some((d) => d.data.some((v) => v > 0));
  const hasDoughnut = doughnutData.datasets[0]?.data.some((v) => v > 0);
  return (
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div class={`lg:col-span-2 ${CARD}`}>
        <h4 class={TITLE}>Tâches par agent</h4>
        {hasBarData ? (
          <div class="h-52">
            <BarChart data={barData} />
          </div>
        ) : (
          <div class={EMPTY}>Aucune donnée disponible</div>
        )}
      </div>
      <div class={CARD}>
        <h4 class={TITLE}>Répartition statuts</h4>
        {hasDoughnut ? (
          <div class="h-52">
            <DoughnutChart data={doughnutData} />
          </div>
        ) : (
          <div class={EMPTY}>Aucune activité agrégée</div>
        )}
      </div>
    </div>
  );
}
