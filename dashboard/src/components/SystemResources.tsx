import { useState, useEffect } from 'preact/hooks';

export default function SystemResources() {
  const [stats, setStats] = useState({
    memoryUsage: 0,
    cpuLoad: 0,
    uptime: 0,
    platform: ''
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/system-status');
        const data = await res.json();
        setStats(data);
        setLoading(false);
      } catch (e) {
        console.error("Failed to fetch system stats", e);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) return <div class="animate-pulse h-20 bg-slate-900 rounded-xl"></div>;

  return (
    <div class="mt-8">
      <h3 class="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500">Ressources Systèmes</h3>
      <div class="mt-4 px-3 space-y-4">
        <div>
          <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>RAM Usage</span>
            <span>{stats.memoryUsage == null ? '—' : `${stats.memoryUsage}%`}</span>
          </div>
          <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full bg-blue-500 rounded-full transition-all duration-500" style={`width: ${stats.memoryUsage == null ? 0 : stats.memoryUsage}%`}></div>
          </div>
        </div>
        <div>
          <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Charge CPU</span>
            <span>{stats.cpuLoad == null ? '—' : `${stats.cpuLoad}%`}</span>
          </div>
          <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div class="h-full bg-indigo-500 rounded-full transition-all duration-500" style={`width: ${stats.cpuLoad == null ? 0 : stats.cpuLoad}%`}></div>
          </div>
        </div>
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
