import { useState, useEffect } from 'preact/hooks';

export default function SystemMonitor() {
  const [stats, setStats] = useState({ memoryUsage: 0, cpuLoad: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/system-status');
        const data = await res.json();
        setStats(data);
      } catch { /* ignore */ }
    };
    fetchStats();
    const interval = setInterval(fetchStats, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div class="mt-4 px-3 space-y-4">
      {[
        { label: 'RAM (Système)', val: stats.memoryUsage, color: 'bg-blue-500' },
        {
          label: 'Charge CPU',
          val: stats.cpuLoad,
          color: (stats.cpuLoad ?? 0) > 80 ? 'bg-red-500' : (stats.cpuLoad ?? 0) > 50 ? 'bg-yellow-500' : 'bg-indigo-500',
        },
      ].map(({ label, val, color }) => (
        <div key={label}>
          <div class="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{label}</span>
            <span class="font-mono">{val == null ? '—' : `${val}%`}</span>
          </div>
          <div class="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
            <div class={`h-full ${color} rounded-full transition-all duration-1000`} style={`width: ${val ?? 0}%`} />
          </div>
        </div>
      ))}
    </div>
  );
}
