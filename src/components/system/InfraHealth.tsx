import { useState, useEffect } from 'preact/hooks';

export default function InfraHealth() {
  const [stats, setStats] = useState({ memoryUsage: 0, cpuLoad: 0, diskUsage: 0, uptime: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/system-status');
        const data = await res.json();
        setStats(data);
        setLoading(false);
      } catch { /* ignore */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  const statusColor = (v: number) => v > 85 ? 'text-error' : v > 65 ? 'text-warning' : 'text-success';
  const barColor = (v: number) => v > 85 ? 'progress-error' : v > 65 ? 'progress-warning' : 'progress-success';

  if (loading) return (
    <div class="px-4 py-6 animate-pulse">
      <div class="h-4 bg-slate-800 rounded w-1/2 mb-4" />
      <div class="flex gap-4 mb-4">
        <div class="w-16 h-16 rounded-full bg-slate-800" />
        <div class="w-16 h-16 rounded-full bg-slate-800" />
      </div>
      <div class="h-2 bg-slate-800 rounded w-full" />
    </div>
  );

  return (
    <div class="px-4 py-6 border-t border-slate-800">
      <h3 class="text-xs font-bold uppercase tracking-widest text-slate-500 mb-4 flex items-center gap-2">
        <span class="relative flex h-2 w-2">
          <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75" />
          <span class="relative inline-flex rounded-full h-2 w-2 bg-success" />
        </span>
        Santé Infra
      </h3>
      <div class="flex justify-around mb-6">
        {[{ v: stats.cpuLoad, label: 'CPU' }, { v: stats.memoryUsage, label: 'RAM' }].map(({ v, label }) => (
          <div key={label} class="flex flex-col items-center gap-2">
            <div class={`radial-progress ${statusColor(v)} bg-slate-800 border-4 border-slate-800 font-bold text-xs`} style={`--value:${v}; --size:3.5rem; --thickness: 4px;`} role="progressbar">{v}%</div>
            <span class="text-[10px] font-medium text-slate-400">{label}</span>
          </div>
        ))}
      </div>
      <div class="space-y-1">
        <div class="flex justify-between text-[10px] font-medium text-slate-400">
          <span>Stockage (/mnt/Docker)</span>
          <span class={stats.diskUsage > 90 ? 'text-error font-bold' : ''}>{stats.diskUsage}%</span>
        </div>
        <progress class={`progress w-full h-1.5 ${barColor(stats.diskUsage)} bg-slate-800`} value={stats.diskUsage} max="100" />
      </div>
      <div class="mt-4 text-[9px] font-mono text-slate-600 text-right">
        Uptime: {Math.floor(stats.uptime / 3600)}h {Math.floor((stats.uptime % 3600) / 60)}m
      </div>
    </div>
  );
}
