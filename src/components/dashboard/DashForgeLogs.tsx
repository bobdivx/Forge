import { useState, useEffect } from 'preact/hooks';

export default function DashForgeLogs() {
  const [logs, setLogs] = useState<string[]>([]);
  const [type, setType] = useState<'watchdog' | 'dashboard'>('watchdog');
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await fetch(`/api/forge-logs?type=${type}&lines=30`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error('Erreur fetch forge logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const t = setInterval(fetchLogs, 10000);
    return () => clearInterval(t);
  }, [type]);

  if (loading && logs.length === 0) return <div class="bg-slate-900 rounded-2xl p-6 h-full animate-pulse" />;

  return (
    <div class="bg-slate-950 rounded-2xl border border-slate-800 shadow-xl overflow-hidden h-full flex flex-col">
      <div class="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900/50">
        <div class="flex items-center gap-3">
          <div class="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></div>
          <h3 class="font-bold text-slate-200 text-xs uppercase tracking-widest">Logs Console</h3>
        </div>
        <div class="flex bg-slate-800 rounded-lg p-0.5">
          <button 
            onClick={() => setType('watchdog')}
            class={`px-3 py-1 rounded-md text-[10px] font-bold transition-colors ${type === 'watchdog' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Watchdog
          </button>
          <button 
            onClick={() => setType('dashboard')}
            class={`px-3 py-1 rounded-md text-[10px] font-bold transition-colors ${type === 'dashboard' ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            Astro
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto p-4 font-mono text-[10px] selection:bg-cyan-500/30">
        {logs.length === 0 ? (
          <div class="text-slate-600 italic">Aucun log disponible.</div>
        ) : (
          <div class="space-y-1">
            {logs.map((line, i) => {
              const isError = line.toLowerCase().includes('error') || line.toLowerCase().includes('fail') || line.toLowerCase().includes('exception');
              const isWarn = line.toLowerCase().includes('warn');
              return (
                <div key={i} class={`break-all ${isError ? 'text-red-400' : isWarn ? 'text-amber-400' : 'text-slate-400'}`}>
                  <span class="text-slate-600 mr-2">[{logs.length - i}]</span>
                  {line}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
