import { useState, useEffect } from 'preact/hooks';

type AuditLog = { id: string; type: 'task' | 'message'; agent: string; to?: string; content: string; input?: string; output?: string; status?: string; timestamp: string; };

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'pending') return <span class="badge badge-warning badge-xs">En attente</span>;
  if (s === 'running') return <span class="badge badge-info badge-xs animate-pulse">En cours</span>;
  if (s === 'success' || s === 'completed') return <span class="badge badge-success badge-xs">Succès</span>;
  if (s === 'error' || s === 'failed') return <span class="badge badge-error badge-xs">Erreur</span>;
  return <span class="badge badge-ghost badge-xs">{status}</span>;
}

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs');
      const data = await res.json();
      if (data.logs) setLogs(data.logs);
      else if (data.error) setError(data.error);
    } catch { setError('Impossible de charger les logs'); } finally { setLoading(false); }
  };

  useEffect(() => { fetchLogs(); const t = setInterval(fetchLogs, 15000); return () => clearInterval(t); }, []);

  if (loading && logs.length === 0) return <div class="flex justify-center p-12"><span class="loading loading-spinner loading-lg text-primary" /></div>;
  if (error) return <div class="alert alert-error shadow-lg"><span>{error}</span></div>;

  return (
    <div class="bg-base-200/50 rounded-xl overflow-hidden shadow-xl border border-white/5 h-full flex flex-col">
      <div class="px-6 py-4 bg-base-300 border-b border-white/5 flex justify-between items-center">
        <h3 class="text-sm font-bold uppercase tracking-widest text-slate-400">Journal d'Audit Unifié</h3>
        <button onClick={fetchLogs} class="btn btn-ghost btn-xs">Rafraîchir</button>
      </div>
      <div class="flex-1 overflow-y-auto p-4">
        {logs.length === 0 ? (
          <div class="text-center py-10 italic text-slate-500">Aucun log récent</div>
        ) : (
          <ul class="timeline timeline-vertical timeline-compact">
            {logs.map((log, idx) => (
              <li key={log.id}>
                {idx > 0 && <hr class="bg-base-300" />}
                <div class="timeline-start text-xs font-mono opacity-50">{new Date(log.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                <div class="timeline-middle">
                  <div class={`w-2 h-2 rounded-full ${log.type === 'task' ? 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]'}`} />
                </div>
                <div class="timeline-end timeline-box bg-base-300/40 border-none mb-4 p-3 rounded-lg w-full max-w-lg">
                  <div class="flex items-center gap-2 mb-1">
                    <span class={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${log.type === 'task' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>{log.type === 'task' ? 'TASK' : 'MSG'}</span>
                    <span class="text-xs font-bold text-slate-200">{log.agent}</span>
                    {log.type === 'task' && <StatusBadge status={log.status!} />}
                  </div>
                  <div class="text-sm text-slate-400 leading-relaxed break-words">{log.content}{log.to && <span class="ml-2 italic text-slate-500">→ {log.to}</span>}</div>
                </div>
                {idx < logs.length - 1 && <hr class="bg-base-300" />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
