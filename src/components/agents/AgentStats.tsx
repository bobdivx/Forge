import { useState, useEffect } from 'preact/hooks';

interface Agent {
  id?: string;
  name: string;
  status: string;
  model: string;
  contextTokens?: number | null;
  lastSeen?: string;
}

export default function AgentStats() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((data) => {
        if (data.error) { setError(String(data.error)); setAgents([]); }
        else if (Array.isArray(data)) { setAgents(data); setError(null); }
        else if (Array.isArray(data.agents)) { setAgents(data.agents); setError(null); }
        else { setAgents([]); setError('Format de réponse invalide'); }
        setLoading(false);
      })
      .catch(() => { setError('Réseau'); setLoading(false); });
  }, []);

  const filtered = agents.filter((a) => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div class="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full max-h-[400px]">
      <div class="p-5 border-b border-slate-800 flex items-center justify-between sticky top-0 bg-slate-900 z-10 rounded-t-xl">
        <h3 class="font-bold text-white flex items-center gap-2 text-sm tracking-tight">
          <svg class="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          Sessions OpenClaw
        </h3>
        <span class="bg-slate-800 text-xs text-slate-400 px-2.5 py-1 rounded-full border border-slate-700 font-medium">
          {agents.length} session(s)
        </span>
      </div>
      {error && <div class="px-5 pt-3 text-[11px] text-amber-400 border-b border-slate-800 pb-2">{error}</div>}
      <div class="px-5 pt-4 pb-2">
        <div class="relative">
          <svg class="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" placeholder="Filtrer par nom…" value={search} onInput={(e) => setSearch((e.target as HTMLInputElement).value)} class="w-full bg-slate-950 border border-slate-800 text-xs rounded-md pl-8 pr-3 py-1.5 focus:border-purple-500 outline-none transition" />
        </div>
      </div>
      <div class="flex-1 overflow-y-auto px-5 pb-5 space-y-3 mt-2">
        {loading ? (
          <div class="text-center text-xs text-slate-500 py-4 animate-pulse">Chargement…</div>
        ) : filtered.length === 0 ? (
          <div class="text-center text-xs text-slate-500 py-4">Aucune session (ou filtre vide)</div>
        ) : (
          filtered.map((agent) => (
            <div class="flex items-center justify-between group" key={agent.id || agent.name}>
              <div class="flex items-center gap-2.5 min-w-0">
                <div class="relative flex h-2 w-2 shrink-0">
                  <span class={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${agent.status === 'actif' ? 'bg-emerald-400' : 'bg-slate-400'}`} />
                  <span class={`relative inline-flex rounded-full h-2 w-2 ${agent.status === 'actif' ? 'bg-emerald-500' : 'bg-slate-500'}`} />
                </div>
                <span class="text-xs font-mono text-slate-300 group-hover:text-white transition cursor-default truncate">{agent.name}</span>
              </div>
              <div class="flex flex-col items-end gap-0.5 shrink-0 ml-2">
                <span class="text-[10px] font-mono text-slate-500 max-w-[9rem] truncate" title={agent.model}>{agent.model}</span>
                <span class={`text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded border ${agent.status === 'actif' ? 'text-emerald-500 bg-slate-950 border-emerald-500/20' : 'text-slate-500 bg-slate-950 border-slate-800'}`}>
                  {agent.status === 'actif' ? 'Actif' : 'Veille'}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
