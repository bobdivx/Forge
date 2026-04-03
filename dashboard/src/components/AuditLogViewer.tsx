import { useState, useEffect } from 'preact/hooks';

type AuditLog = {
  id: string;
  type: 'task' | 'message';
  agent: string;
  to?: string;
  content: string;
  input?: string;
  output?: string;
  status?: string;
  timestamp: string;
};

export default function AuditLogViewer() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/audit-logs');
      const data = await res.json();
      if (data.logs) {
        setLogs(data.logs);
      } else if (data.error) {
        setError(data.error);
      }
    } catch (err) {
      setError("Impossible de charger les logs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 15000);
    return () => clearInterval(interval);
  }, []);

  const getStatusBadge = (status: string) => {
    const s = (status || '').toLowerCase();
    switch (s) {
      case 'pending':
        return <span class="badge badge-warning badge-xs">En attente</span>;
      case 'running':
        return <span class="badge badge-info badge-xs animate-pulse">En cours</span>;
      case 'success':
      case 'completed':
        return <span class="badge badge-success badge-xs">Succès</span>;
      case 'error':
      case 'failed':
        return <span class="badge badge-error badge-xs">Erreur</span>;
      default:
        return <span class="badge badge-ghost badge-xs">{status}</span>;
    }
  };

  if (loading && logs.length === 0) {
    return (
      <div class="flex justify-center p-12">
        <span class="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div class="alert alert-error shadow-lg">
        <div>
          <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current flex-shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{error}</span>
        </div>
      </div>
    );
  }

  return (
    <div class="bg-base-200/50 rounded-xl overflow-hidden shadow-xl border border-white/5 h-full flex flex-col">
      <div class="px-6 py-4 bg-base-300 border-b border-white/5 flex justify-between items-center">
        <h3 class="text-sm font-bold uppercase tracking-widest text-slate-400">Journal d'Audit Unifié</h3>
        <button onClick={fetchLogs} class="btn btn-ghost btn-xs">Rafraîchir</button>
      </div>

      <div class="flex-1 overflow-y-auto p-4 custom-scrollbar">
        {logs.length === 0 ? (
          <div class="text-center py-10 italic text-slate-500">Aucun log récent</div>
        ) : (
          <ul class="timeline timeline-vertical timeline-compact">
            {logs.map((log, idx) => (
              <li key={log.id}>
                {idx > 0 && <hr class="bg-base-300" />}
                <div class="timeline-start text-xs font-mono opacity-50">
                  {new Date(log.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div class="timeline-middle">
                  {log.type === 'task' ? (
                    <div class="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                  ) : (
                    <div class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                  )}
                </div>
                <div class="timeline-end timeline-box bg-base-300/40 border-none mb-4 p-3 rounded-lg w-full max-w-lg">
                  <div class="flex items-center gap-2 mb-1">
                    <span class={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold ${log.type === 'task' ? 'bg-blue-500/20 text-blue-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                      {log.type === 'task' ? 'TASK' : 'MSG'}
                    </span>
                    <span class="text-xs font-bold text-slate-200">{log.agent}</span>
                    {log.type === 'task' && getStatusBadge(log.status!)}
                  </div>
                  <div class="text-sm text-slate-400 leading-relaxed break-words">
                    {log.content}
                    {log.to && <span class="ml-2 italic text-slate-500">→ {log.to}</span>}
                  </div>
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
