import { useEffect, useState } from 'preact/hooks';

/** Tuile « bugs découverts par agents » — agrégat source agent dans /api/work-overview */
export default function AgentsDiscoveryKpi() {
  const [n, setN] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/work-overview')
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        const v = d?.charts?.bySource?.agent;
        setN(typeof v === 'number' ? v : 0);
      })
      .catch(() => setN(0));
    const id = window.setInterval(() => {
      fetch('/api/work-overview')
        .then((r) => r.json())
        .then((d) => setN(typeof d?.charts?.bySource?.agent === 'number' ? d.charts.bySource.agent : 0))
        .catch(() => {});
    }, 20_000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return (
    <div class="bg-white rounded-[1.5rem] shadow-sm p-5">
      <span class="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Bugs source agents</span>
      <span class="text-5xl font-bold" style="color:#3BAE61">{n ?? '—'}</span>
      <span class="text-xs text-gray-400 block mt-2">remontées proactives (DB)</span>
    </div>
  );
}
