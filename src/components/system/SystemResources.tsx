import { useState, useEffect } from 'preact/hooks';

export default function SystemResources() {
  const [stats, setStats] = useState({ memoryUsage: 0, cpuLoad: 0, uptime: 0, platform: '' });
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

  if (loading) return <div class="animate-pulse h-20 bg-slate-900 rounded-xl" />;

  return (
    <div class="mt-8">
      <h3 class="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Ressources Systèmes</h3>
      <div class="mt-4 px-3 space-y-4">
        {[
          { label: 'RAM Usage', val: stats.memoryUsage, color: 'bg-blue-500' },
          { label: 'Charge CPU', val: stats.cpuLoad, color: 'bg-indigo-500' },
        ].map(({ label, val, color }) => (
          <div key={label}>
            <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span>{label}</span>
              <span>{val == null ? '—' : `${val}%`}</span>
            </div>
            <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
              <div class={`h-full ${color} rounded-full transition-all duration-500`} style={`width: ${val ?? 0}%`} />
            </div>
          </div>
        ))}
        <div class="pt-2">
          <div class="flex items-center justify-between text-[10px] text-slate-500 font-mono">
            <span>Uptime</span>
            <span>{stats.uptime == null ? '—' : `${Math.floor(stats.uptime / 3600)}h ${Math.floor((stats.uptime % 3600) / 60)}m`}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
