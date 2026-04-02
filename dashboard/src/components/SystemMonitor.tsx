import { useState, useEffect } from 'preact/hooks';

export default function SystemMonitor() {
  const [stats, setStats] = useState({ memoryUsage: 0, cpuLoad: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/system-status');
        const data = await res.json();
        setStats(data);
      } catch (e) {
        console.error("Erreur lecture sonde système");
      }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div class="mt-4 px-3 space-y-4">
      <div>
        <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>RAM (Système)</span>
          <span class="font-mono">{stats.memoryUsage == null ? '—' : `${stats.memoryUsage}%`}</span>
        </div>
        <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
          <div class="h-full bg-blue-500 rounded-full transition-all duration-1000" style={`width: ${stats.memoryUsage == null ? 0 : stats.memoryUsage}%`}></div>
        </div>
      </div>
      <div>
        <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
          <span>Charge CPU</span>
          <span class="font-mono">{stats.cpuLoad == null ? '—' : `${stats.cpuLoad}%`}</span>
        </div>
        <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
          <div class={`h-full rounded-full transition-all duration-1000 ${(stats.cpuLoad ?? 0) > 80 ? 'bg-red-500' : (stats.cpuLoad ?? 0) > 50 ? 'bg-yellow-500' : 'bg-indigo-500'}`} style={`width: ${stats.cpuLoad == null ? 0 : stats.cpuLoad}%`}></div>
        </div>
      </div>
    </div>
  );
}
