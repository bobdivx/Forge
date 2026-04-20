import { useState, useEffect } from 'preact/hooks';

export default function SystemMonitor() {
  const [stats, setStats] = useState({ 
    memoryUsage: 0, 
    cpuLoad: 0, 
    diskUsage: 0, 
    githubDiskUsage: 0,
    unhealthyContainers: [] 
  });

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
      {stats.unhealthyContainers?.length > 0 && (
        <div class="p-2 bg-red-500/20 border border-red-500/50 rounded text-[10px] text-red-400">
          <span class="font-bold uppercase block mb-1">⚠️ Conteneurs instables</span>
          <ul class="list-disc list-inside opacity-80">
            {stats.unhealthyContainers.map(name => <li key={name}>{name}</li>)}
          </ul>
        </div>
      )}
      
      {[
        { label: 'RAM (Système)', val: stats.memoryUsage, color: 'bg-blue-500' },
        {
          label: 'Charge CPU',
          val: stats.cpuLoad,
          color: (stats.cpuLoad ?? 0) > 80 ? 'bg-red-500' : (stats.cpuLoad ?? 0) > 50 ? 'bg-yellow-500' : 'bg-indigo-500',
        },
        { 
          label: 'Disque (Docker)', 
          val: stats.diskUsage, 
          color: (stats.diskUsage ?? 0) > 90 ? 'bg-red-500' : 'bg-emerald-500' 
        },
        { 
          label: 'Disque (GitHub)', 
          val: stats.githubDiskUsage, 
          color: (stats.githubDiskUsage ?? 0) > 90 ? 'bg-red-500' : 'bg-cyan-500' 
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
