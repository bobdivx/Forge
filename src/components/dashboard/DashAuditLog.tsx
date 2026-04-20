import { useState, useEffect } from 'preact/hooks';

interface LogEntry {
  id: number;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  details: string | null;
  createdAt: string;
}

export default function DashAuditLog() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    try {
      const res = await fetch('/api/activity-log?limit=20');
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs || []);
      }
    } catch (e) {
      console.error('Erreur fetch logs:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const t = setInterval(fetchLogs, 20000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <div class="bg-white rounded-2xl p-6 shadow-sm h-full animate-pulse" />;

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const getActionColor = (action: string) => {
    if (action.includes('error') || action.includes('failed')) return 'text-red-600';
    if (action.includes('started') || action.includes('approved')) return 'text-emerald-600';
    if (action.includes('paused')) return 'text-amber-600';
    return 'text-blue-600';
  };

  return (
    <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden h-full flex flex-col">
      <div class="p-5 border-b border-gray-50 flex justify-between items-center bg-gray-50/30">
        <h3 class="font-bold text-gray-800 flex items-center gap-2 text-sm">
          <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Journal d'Audit
        </h3>
        <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Temps Réel</span>
      </div>

      <div class="overflow-y-auto flex-1 p-2">
        {logs.length === 0 ? (
          <div class="p-10 text-center text-gray-400 italic text-xs">
            Aucune activité enregistrée.
          </div>
        ) : (
          <div class="space-y-1">
            {logs.map((log) => (
              <div key={log.id} class="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors text-[11px] group">
                <span class="text-gray-400 font-mono shrink-0 pt-0.5">{formatTime(log.createdAt)}</span>
                <div class="flex-1 min-w-0">
                   <div class="flex items-center gap-1.5 flex-wrap">
                     <span class="font-bold text-gray-700">{log.actorId}</span>
                     <span class={`font-medium ${getActionColor(log.action)}`}>{log.action}</span>
                     <span class="text-gray-400">sur</span>
                     <span class="bg-gray-100 px-1 rounded text-gray-600 border border-gray-200">{log.entityType}:{log.entityId}</span>
                   </div>
                   {log.details && (
                     <div class="text-gray-400 mt-0.5 truncate group-hover:whitespace-normal group-hover:overflow-visible group-hover:bg-gray-50 group-hover:relative group-hover:z-10">
                       {log.details}
                     </div>
                   )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
