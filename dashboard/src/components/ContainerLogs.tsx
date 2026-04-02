import { useState, useEffect, useRef } from 'preact/hooks';

export default function ContainerLogs() {
  const [containers, setContainers] = useState<any[]>([]);
  const [selectedContainer, setSelectedContainer] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  // Charger la liste des conteneurs
  useEffect(() => {
    fetch('/api/docker')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setContainers(data);
          if (data.length > 0 && !selectedContainer) {
            setSelectedContainer(data[0].ID || data[0].Names);
          }
        }
      })
      .catch(() => setError("Impossible de charger les conteneurs"));
  }, []);

  // Polling des logs
  useEffect(() => {
    if (!selectedContainer) return;

    let isCancelled = false;
    const fetchLogs = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/docker-logs?id=${selectedContainer}&tail=100`);
        const data = await res.json();
        if (isCancelled) return;
        if (data.logs) {
          setLogs(data.logs);
          setError(null);
        } else if (data.error) {
          setError(data.error);
        }
      } catch (e) {
        if (!isCancelled) setError("Erreur de connexion");
      } finally {
        if (!isCancelled) setLoading(false);
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 5000);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, [selectedContainer]);

  // Scroll auto en bas
  useEffect(() => {
    if (logEndRef.current) {
        logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  return (
    <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col h-[500px] shadow-2xl">
      <div class="flex items-center justify-between px-4 py-3 bg-slate-800/50 border-b border-slate-800">
        <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <svg class="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
            </div>
            <h3 class="text-sm font-bold text-slate-200 uppercase tracking-wider">Logs Conteneur</h3>
        </div>
        
        <select 
          class="select select-bordered select-sm bg-slate-950 border-slate-700 text-slate-300 focus:ring-blue-500 max-w-[200px]"
          value={selectedContainer}
          onChange={(e) => setSelectedContainer((e.target as HTMLSelectElement).value)}
        >
          {containers.length === 0 && <option value="">Chargement...</option>}
          {containers.map(c => (
            <option key={c.ID} value={c.ID}>{c.Names} ({c.Image})</option>
          ))}
        </select>
      </div>

      <div class="flex-1 p-4 font-mono text-[11px] overflow-y-auto bg-black text-emerald-400 selection:bg-emerald-500/20 custom-scrollbar scroll-smooth">
        {error && <div class="text-red-400 mb-4 font-bold p-3 bg-red-900/10 rounded border border-red-900/20">Error: {error}</div>}
        {logs.length === 0 && !loading && !error && <div class="text-slate-500 italic">Aucun log à afficher pour ce conteneur.</div>}
        
        <div class="flex flex-col gap-1">
          {logs.map((line, i) => (
            <div key={i} class="hover:bg-white/5 px-1 rounded transition-colors whitespace-pre-wrap break-all border-l border-white/5 pl-2 ml-1">
              {line}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      </div>
      
      <div class="px-4 py-2.5 bg-slate-900 border-t border-slate-800 flex items-center justify-between">
        <div class="flex items-center gap-2">
            <span class="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span class="text-[10px] text-slate-500 font-medium uppercase tracking-tighter">Flux en direct</span>
        </div>
        {loading && <span class="loading loading-spinner loading-xs text-blue-500"></span>}
      </div>
    </div>
  );
}
