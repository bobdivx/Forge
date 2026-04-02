import { useState, useEffect } from 'preact/hooks';

interface Agent {
  id: string;
  name: string;
  status: string;
  model: string;
  contextTokens?: number | null;
  lastSeen?: string;
  totalTokens?: number;
  estimatedCostUsd?: number;
  runtimeMs?: number;
}

export default function SwarmGrid() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const formatAgentName = (name: string) => {
    // Si c'est un subagent complexe, on essaie d'extraire la partie métier
    if (name.includes('subagent:')) {
      // Cas agent:main:subagent:ID -> on garde "Subagent (ID)"
      const parts = name.split(':');
      const id = parts.pop() || '';
      return \`Sub-Agent (\${id.slice(0, 8)})\`;
    }
    // Nettoyage des préfixes techniques courants
    return name
      .replace('telegram:g-agent-', '')
      .replace('agent:', '')
      .replace(':main', '')
      .toUpperCase();
  };

  useEffect(() => {
    const fetchAgents = () => {
      fetch('/api/agents')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setAgents(data);
          }
          setLoading(false);
        })
        .catch(() => {
          setError('Erreur réseau');
          setLoading(false);
        });
    };

    fetchAgents();
    const interval = setInterval(fetchAgents, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading && agents.length === 0) {
    return (
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[1, 2, 3].map(i => (
          <div key={i} class="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-48 animate-pulse"></div>
        ))}
      </div>
    );
  }

  return (
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {agents.map((agent) => (
        <a 
          href={\`/swarm/\${agent.id}\`}
          key={agent.id}
          class=\`group bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/50 hover:bg-slate-800/50 transition-all duration-300 shadow-xl flex flex-col\`
        >

          <div class="flex justify-between items-start mb-4">
            <div class="flex items-center gap-3">
              <div class="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                <svg class="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                </svg>
              </div>
              <div>
                <h3 class="font-bold text-white group-hover:text-blue-400 transition-colors truncate max-w-[150px]">
                  {formatAgentName(agent.name)}
                </h3>
                <span class="text-[10px] font-mono text-slate-500">{agent.id.split(':').pop()?.slice(0,8)}</span>
              </div>
            </div>
            <div class={\`badge \${agent.status === 'actif' ? 'badge-success' : 'badge-ghost'} badge-sm font-bold uppercase tracking-wider text-[9px]\`}>
              {agent.status}
            </div>
          </div>

          <div class="space-y-3 flex-1">
            <div class="flex justify-between items-center text-[11px]">
              <span class="text-slate-500 uppercase tracking-tighter">Modèle Actuel</span>
              <span class="text-blue-300 font-mono bg-blue-500/5 px-1.5 py-0.5 rounded">{agent.model.split('/').pop()}</span>
            </div>
            
            <div class="flex justify-between items-center text-[11px]">
              <span class="text-slate-500">Volume Data</span>
              <span class="text-slate-300">{(agent.totalTokens || 0).toLocaleString()} tokens</span>
            </div>

            {agent.estimatedCostUsd > 0 && (
              <div class="flex justify-between items-center text-[11px]">
                <span class="text-slate-500">Coût Estimé</span>
                <span class="text-emerald-400 font-bold">$\${agent.estimatedCostUsd.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div class="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
            <span class="text-[10px] text-slate-600 italic">Vu le {agent.lastSeen?.split(' ').pop()}</span>
            <div class="text-blue-500 group-hover:translate-x-1 transition-transform">
               <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
               </svg>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}
