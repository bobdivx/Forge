import { useState, useEffect } from 'preact/hooks';

type AgentTask = {
  id: number | string;
  agentId: string;
  task: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  source?: 'db' | 'gateway';
};

function StatusBadge({ status }: { status: string }) {
  const s = (status || '').toLowerCase();
  if (s === 'pending') return <span class="badge badge-warning badge-sm font-bold uppercase tracking-tighter py-2.5 px-3">En attente</span>;
  if (s === 'running') return <span class="badge badge-info badge-sm font-bold uppercase tracking-tighter py-2.5 px-3 animate-pulse text-white">En cours</span>;
  if (s === 'success' || s === 'completed') return <span class="badge badge-success badge-sm font-bold uppercase tracking-tighter py-2.5 px-3 text-white">Succès</span>;
  if (s === 'error' || s === 'failed') return <span class="badge badge-error badge-sm font-bold uppercase tracking-tighter py-2.5 px-3 text-white">Erreur</span>;
  return <span class="badge badge-ghost badge-sm font-bold uppercase tracking-tighter py-2.5 px-3 border border-slate-700">{status}</span>;
}

export default function AgentTaskTable() {
  const [tasks, setTasks] = useState<AgentTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetch_ = async () => {
      try {
        const res = await fetch('/api/agent-tasks');
        const data = await res.json();
        if (data.tasks) setTasks(data.tasks);
        else if (data.error) setError(data.error);
      } catch {
        setError('Impossible de charger les tâches');
      } finally {
        setLoading(false);
      }
    };
    fetch_();
    const t = setInterval(fetch_, 10000);
    return () => clearInterval(t);
  }, []);

  if (loading && tasks.length === 0) return <div class="flex justify-center p-8"><span class="loading loading-spinner text-blue-500" /></div>;
  if (error && tasks.length === 0) return <div class="p-6 text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl m-4 text-sm"><span class="font-bold">Information :</span> {error}.</div>;
  if (tasks.length === 0) return <div class="p-8 text-center text-slate-500 italic">Aucune session gateway ni tâche persistée à afficher. Vérifiez le token OpenClaw dans les paramètres.</div>;

  return (
    <div class="overflow-x-auto p-4">
      <table class="table table-zebra w-full text-slate-300">
        <thead class="bg-slate-800/50 text-[11px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
          <tr>
            <th class="px-6 py-4">ID</th>
            <th class="px-6 py-4">Agent</th>
            <th class="px-6 py-4">Tâche</th>
            <th class="px-6 py-4 text-center">Statut</th>
            <th class="px-6 py-4 text-right">Date</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/30">
          {tasks.map((task) => (
            <tr key={String(task.id)} class="hover:bg-slate-800/20 transition-all border-slate-800/30 group">
              <td class="px-6 py-4">
                <span class={`font-mono text-xs px-2 py-0.5 rounded border ${task.source === 'gateway' ? 'text-violet-300 bg-violet-500/10 border-violet-500/20' : 'text-blue-400 bg-blue-500/10 border-blue-500/10'}`}>
                  {task.source === 'gateway' ? 'GW' : `#${task.id}`}
                </span>
              </td>
              <td class="px-6 py-4">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-[10px] text-indigo-400 font-bold uppercase">
                    {task.agentId?.charAt(0) || 'A'}
                  </div>
                  <span class="text-slate-200 font-medium text-xs truncate max-w-[100px]">{task.agentId}</span>
                </div>
              </td>
              <td class="px-6 py-4 text-sm text-slate-400 max-w-xs group-hover:max-w-none transition-all">
                <div class="truncate group-hover:whitespace-normal group-hover:break-words">{task.task}</div>
              </td>
              <td class="px-6 py-4 text-center"><StatusBadge status={task.status} /></td>
              <td class="px-6 py-4 text-right whitespace-nowrap text-[10px] text-slate-500 font-mono">
                {new Date(task.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
