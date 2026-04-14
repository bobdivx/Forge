import { useState, useEffect } from 'preact/hooks';

interface EconomicsStats {
  totalCost: number;
  totalTokens: number;
  activeSessions: number;
  failedSessions: number;
  currency: string;
  sessionCount: number;
}

export default function ForgeEconomics() {
  const [stats, setStats] = useState<EconomicsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/openclaw-economics-stats');
      const data = await res.json();
      setStats(data);
    } finally {
      setLoading(false);
    }
  };

  const cleanSessions = async () => {
    if (!confirm('Voulez-vous vraiment fermer les sessions en erreur ou trop anciennes ?')) return;
    setCleaning(true);
    try {
      const res = await fetch('/api/openclaw-clean-sessions', { method: 'POST' });
      const data = await res.json();
      alert(data.message || 'Sessions nettoyées avec succès.');
      await fetchStats();
    } catch {
      alert('Erreur lors du nettoyage des sessions.');
    } finally {
      setCleaning(false);
    }
  };

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !stats) {
    return (
      <div class="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse">
        <div class="h-4 bg-slate-800 rounded w-1/3 mb-4" /><div class="h-8 bg-slate-800 rounded w-full" />
      </div>
    );
  }

  const { totalCost = 0, totalTokens = 0, activeSessions = 0, failedSessions = 0, currency = 'USD', sessionCount = 0 } = stats || {};

  return (
    <div class="bg-gradient-to-br from-slate-900 to-indigo-950 border border-indigo-500/30 rounded-xl p-6 relative overflow-hidden group shadow-xl">
      <div class="absolute -right-6 -top-6 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all duration-500" />
      <div class="flex justify-between items-start relative z-10">
        <div>
          <h3 class="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-1 flex items-center gap-2">
            <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            Forge Economics
          </h3>
          <div class="flex items-baseline gap-2">
            <span class="text-3xl font-extrabold text-white font-mono">{totalCost.toFixed(2)}</span>
            <span class="text-sm font-medium text-slate-500">{currency}</span>
          </div>
          <p class="text-[10px] text-slate-400 mt-1 uppercase tracking-tight">Coût total estimé · {sessionCount} sessions</p>
        </div>
        <button onClick={cleanSessions} disabled={cleaning || failedSessions === 0} class={`btn btn-xs rounded-lg px-3 py-1.5 h-auto text-[10px] font-bold uppercase tracking-tighter border-none ${failedSessions > 0 ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-slate-800 text-slate-500 cursor-not-allowed'}`}>
          {cleaning ? <span class="loading loading-spinner loading-xs" /> : 'Clean Dead Sessions'}
        </button>
      </div>
      <div class="grid grid-cols-2 gap-4 mt-6 pt-4 border-t border-white/5 relative z-10">
        <div class="space-y-1">
          <div class="flex items-center gap-1.5"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500" /><span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Actives</span></div>
          <span class="text-sm font-mono text-white">{activeSessions}</span>
        </div>
        <div class="space-y-1">
          <div class="flex items-center gap-1.5"><span class={`w-1.5 h-1.5 rounded-full ${failedSessions > 0 ? 'bg-red-500 animate-pulse' : 'bg-slate-700'}`} /><span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Échecs</span></div>
          <span class={`text-sm font-mono ${failedSessions > 0 ? 'text-red-400 font-bold' : 'text-white'}`}>{failedSessions}</span>
        </div>
        <div class="col-span-2 space-y-1 mt-2">
          <span class="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Consommation totale</span>
          <div class="flex items-baseline gap-1.5">
            <span class="text-sm font-mono text-indigo-300 font-bold">{(totalTokens / 1000).toFixed(1)}k</span>
            <span class="text-[9px] text-slate-500 uppercase">Tokens</span>
          </div>
          <div class="w-full bg-slate-800 rounded-full h-1 mt-1 overflow-hidden">
            <div class="bg-indigo-500 h-full" style={`width: ${Math.min(100, (totalTokens / 50000) * 100)}%`} />
          </div>
        </div>
      </div>
    </div>
  );
}
