import { useState, useEffect } from 'preact/hooks';

type ModelRow = {
  agentId: string;
  openAiTarget: string;
  backendModel: string;
  enabled: boolean;
  inGatewayRegistry: boolean;
  inV1Models: boolean;
  ollamaPresent: boolean | null;
  sanity?: {
    ok: boolean;
    error?: string;
  };
};

type PingResult = { ok: boolean; latencyMs: number; error?: string };

export default function AgentModelMatrix() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [pings, setPings] = useState<Record<string, PingResult>>({});
  const [pinging, setPinging] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/zimaos-models');
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function pingAgent(row: ModelRow) {
    setPinging((p) => ({ ...p, [row.agentId]: true }));
    try {
      const res = await fetch('/api/zimaos-model-ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openAiModel: row.openAiTarget, backendModel: row.backendModel }),
      });
      const json = await res.json();
      setPings((p) => ({ ...p, [row.agentId]: json }));
    } catch (e: any) {
      setPings((p) => ({ ...p, [row.agentId]: { ok: false, latencyMs: 0, error: e.message } }));
    } finally {
      setPinging((p) => ({ ...p, [row.agentId]: false }));
    }
  }

  async function repairAgent(agentId: string) {
    setSyncing(agentId);
    try {
      const res = await fetch('/api/zimaos-sync-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, restart: true }),
      });
      const d = await res.json();
      if (d.ok) {
        load();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(null);
    }
  }

  async function syncAll() {
    setSyncing('all');
    try {
      const res = await fetch('/api/zimaos-sync-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restart: true }),
      });
      if (res.ok) load();
    } catch (e) {
      console.error(e);
    } finally {
      setSyncing(null);
    }
  }

  if (loading) return <div class="p-12 text-center text-gray-400 animate-pulse font-medium">Synchronisation avec ZimaOS...</div>;
  if (!data) return null;

  return (
    <div class="space-y-8">
      {/* Header avec bouton global */}
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-4 overflow-x-auto pb-2 scrollbar-hide">
          <StatCard label="Total Agents" value={data.rows.length} color="blue" />
          <StatCard label="Opérationnels" value={data.rows.filter((r: any) => r.inGatewayRegistry && r.sanity?.ok).length} color="green" />
          <StatCard label="À Synchroniser" value={data.rows.filter((r: any) => !r.sanity?.ok).length} color="amber" />
        </div>
        <button
          onClick={syncAll}
          disabled={syncing === 'all'}
          class="shrink-0 px-6 py-3 rounded-2xl bg-gray-900 text-white font-black text-xs hover:bg-black transition-all shadow-lg shadow-gray-200 disabled:opacity-50 flex items-center gap-2"
        >
          {syncing === 'all' ? <span class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : null}
          SYNCHRONISER TOUT
        </button>
      </div>

      {/* Galerie de Cartes */}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
        {data.rows.map((row: ModelRow) => {
          const ping = pings[row.agentId];
          const isPinging = pinging[row.agentId];
          const isRepairing = syncing === row.agentId;
          
          // Détermination de l'état
          let state = "ACTIF";
          let stateCls = "bg-emerald-50 text-emerald-700 border-emerald-100";
          let dotCls = "bg-emerald-500";

          if (!row.inGatewayRegistry || !row.sanity?.ok) {
            state = "À SYNCHRONISER";
            stateCls = "bg-amber-50 text-amber-700 border-amber-100";
            dotCls = "bg-amber-500 animate-pulse";
          }
          if (!row.backendModel) {
            state = "INCOMPLET";
            stateCls = "bg-rose-50 text-rose-700 border-rose-100";
            dotCls = "bg-rose-500";
          }

          return (
            <div key={row.agentId} class="group bg-white rounded-3xl border border-gray-100 p-5 hover:shadow-xl hover:shadow-gray-200/40 transition-all duration-300 relative overflow-hidden">
              {/* Background Glow Effect */}
              <div class={`absolute -right-8 -top-8 w-24 h-24 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity ${dotCls}`} />
              
              <div class="relative flex flex-col h-full">
                <div class="flex items-start justify-between mb-4">
                  <div class={`flex items-center gap-2 px-2.5 py-1 rounded-full border text-[9px] font-bold tracking-wider ${stateCls}`}>
                    <span class={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
                    {state}
                  </div>
                  <button
                    onClick={() => pingAgent(row)}
                    disabled={isPinging}
                    class="p-1.5 rounded-xl hover:bg-gray-50 text-gray-300 hover:text-gray-600 transition-colors"
                    title="Ping"
                  >
                    {isPinging ? <span class="w-3.5 h-3.5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" /> : <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                  </button>
                </div>

                <div class="mb-5">
                  <h4 class="text-sm font-black text-gray-900 font-mono mb-1">{row.agentId}</h4>
                  <p class="text-[10px] text-gray-400 font-medium truncate">{row.backendModel || 'Aucun modèle LLM défini'}</p>
                </div>

                <div class="mt-auto pt-4 border-t border-gray-50 flex items-center justify-between">
                  <div class="flex items-center gap-2">
                    {ping && (
                      <span class={`text-[10px] font-bold ${ping.ok ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {ping.ok ? `${ping.latencyMs}ms` : '404'}
                      </span>
                    )}
                  </div>
                  
                  {state !== "ACTIF" ? (
                    <button
                      onClick={() => repairAgent(row.agentId)}
                      disabled={isRepairing || syncing === 'all'}
                      class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-gray-900 text-white hover:bg-black transition-colors disabled:opacity-50"
                    >
                      {isRepairing ? "..." : "SYNCHRONISER"}
                    </button>
                  ) : (
                    <span class="text-[10px] font-bold text-gray-300">OPÉRATIONNEL</span>
                  )}
                </div>
                
                {ping && !ping.ok && (
                  <div class="mt-2 text-[9px] text-rose-500 font-bold bg-rose-50 p-1.5 rounded-lg border border-rose-100">
                    ERREUR: {ping.error?.includes('404') ? 'Modèle non reconnu par le NAS' : ping.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: any = {
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div class={`shrink-0 flex items-center gap-3 px-5 py-3 rounded-2xl border border-transparent ${colors[color]} min-w-[140px]`}>
      <div class="text-xl font-black">{value}</div>
      <div class="text-[10px] font-bold uppercase tracking-widest opacity-70 leading-tight">{label}</div>
    </div>
  );
}
