import { useState, useEffect } from 'preact/hooks';

export default function DashSystemStatus() {
  const [data, setData] = useState<{
    memoryUsage: number | null;
    cpuLoad: number | null;
    uptime: number | null;
    diskUsage: number | null;
    githubDiskUsage: number | null;
    platform: string;
    lastMaintenance: string | null;
  } | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/system-status');
        if (res.ok) setData(await res.json());
      } catch { /* ignore */ }
    }
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <div class="bg-white rounded-2xl p-5 shadow-sm h-full animate-pulse" />;

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${d}j ${h}h ${m}m`;
  };

  return (
    <div class="bg-white rounded-2xl p-5 shadow-sm h-full flex flex-col justify-between border border-gray-100">
      <div class="flex justify-between items-start mb-4">
        <div>
          <h3 class="font-bold text-gray-800 text-sm flex items-center gap-2">
             <div class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
             État du Système
          </h3>
          <p class="text-[10px] text-gray-400 uppercase tracking-widest font-bold mt-0.5">ZimaOS / Docker</p>
        </div>
        <span class="text-[10px] font-mono bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
          {data.platform}
        </span>
      </div>

      <div class="space-y-4 flex-1">
        {/* CPU */}
        <div>
          <div class="flex justify-between text-[11px] mb-1">
            <span class="text-gray-500 font-medium">Charge CPU</span>
            <span class="text-gray-700 font-bold">{data.cpuLoad ?? 0}%</span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div 
              class={`h-full rounded-full transition-all duration-500 ${data.cpuLoad && data.cpuLoad > 80 ? 'bg-red-500' : 'bg-indigo-500'}`}
              style={{ width: `${data.cpuLoad ?? 0}%` }}
            ></div>
          </div>
        </div>

        {/* RAM */}
        <div>
          <div class="flex justify-between text-[11px] mb-1">
            <span class="text-gray-500 font-medium">RAM</span>
            <span class="text-gray-700 font-bold">{data.memoryUsage ?? 0}%</span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div 
              class={`h-full rounded-full transition-all duration-500 ${data.memoryUsage && data.memoryUsage > 90 ? 'bg-red-500' : 'bg-emerald-500'}`}
              style={{ width: `${data.memoryUsage ?? 0}%` }}
            ></div>
          </div>
        </div>

        {/* Disk */}
        <div>
          <div class="flex justify-between text-[11px] mb-1">
            <span class="text-gray-500 font-medium">Disque Docker</span>
            <span class="text-gray-700 font-bold">{data.diskUsage ?? 0}%</span>
          </div>
          <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
            <div 
              class={`h-full rounded-full transition-all duration-500 ${data.diskUsage && data.diskUsage > 85 ? 'bg-orange-500' : 'bg-slate-500'}`}
              style={{ width: `${data.diskUsage ?? 0}%` }}
            ></div>
          </div>
        </div>

        {/* GitHub Disk */}
        {data.githubDiskUsage !== null && (
          <div>
            <div class="flex justify-between text-[11px] mb-1">
              <span class="text-gray-500 font-medium">Disque GitHub (FORGE)</span>
              <span class="text-gray-700 font-bold">{data.githubDiskUsage}%</span>
            </div>
            <div class="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div 
                class={`h-full rounded-full transition-all duration-500 ${data.githubDiskUsage > 90 ? 'bg-red-500' : 'bg-blue-500'}`}
                style={{ width: `${data.githubDiskUsage}%` }}
              ></div>
            </div>
          </div>
        )}
      </div>

      <div class="mt-4 pt-3 border-t border-gray-50 flex flex-col gap-1 text-[10px]">
        <div class="flex justify-between items-center">
          <span class="text-gray-400 font-medium uppercase tracking-tighter">Uptime</span>
          <span class="text-gray-600 font-mono font-bold">{data.uptime ? formatUptime(data.uptime) : '—'}</span>
        </div>
        {data.lastMaintenance && (
          <div class="flex justify-between items-center">
            <span class="text-gray-400 font-medium uppercase tracking-tighter">Dernière veille</span>
            <span class="text-indigo-600 font-bold">{new Date(data.lastMaintenance).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        )}
      </div>
    </div>
  );
}
