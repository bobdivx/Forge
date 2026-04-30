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
  if (s === 'pending') return (
    <span class="text-[10px] font-semibold uppercase px-2 py-1 rounded bg-yellow-50 text-yellow-600">En attente</span>
  );
  if (s === 'running') return (
    <span class="text-[10px] font-semibold uppercase px-2 py-1 rounded bg-blue-50 text-blue-600 animate-pulse">En cours</span>
  );
  if (s === 'success' || s === 'completed') return (
    <span class="text-[10px] font-semibold uppercase px-2 py-1 rounded bg-green-50 text-green-600">Succès</span>
  );
  if (s === 'error' || s === 'failed') return (
    <span class="text-[10px] font-semibold uppercase px-2 py-1 rounded bg-red-50 text-red-500">Erreur</span>
  );
  return (
    <span class="text-[10px] font-semibold uppercase px-2 py-1 rounded bg-gray-100 text-gray-500">{status}</span>
  );
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

  if (loading && tasks.length === 0) return (
    <div class="flex justify-center p-8">
      <div class="w-6 h-6 border-2 border-gray-200 border-t-[#175B37] rounded-full animate-spin" />
    </div>
  );
  if (error && tasks.length === 0) return (
    <div class="p-6 text-yellow-700 bg-yellow-50 border border-yellow-200 rounded-xl m-4 text-sm">
      <span class="font-bold">Information :</span> {error}.
    </div>
  );
  if (tasks.length === 0) return (
    <div class="p-8 text-center text-gray-400 italic text-sm">
      Aucune mission enregistrée pour le moment.
    </div>
  );

  return (
    <div class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-gray-100">
            <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-left">ID</th>
            <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-left">Agent</th>
            <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-left">Tâche</th>
            <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-center">Statut</th>
            <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-right">Date</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={String(task.id)} class="border-b border-gray-50 hover:bg-gray-50 transition-colors group">
              <td class="px-5 py-3">
                <span class={`font-mono text-[10px] px-2 py-1 rounded font-semibold ${
                  task.source === 'gateway'
                    ? 'bg-purple-50 text-purple-600'
                    : 'bg-blue-50 text-blue-600'
                }`}>
                  {task.source === 'gateway' ? 'GW' : `#${task.id}`}
                </span>
              </td>
              <td class="px-5 py-3">
                <div class="flex items-center gap-2">
                  <div class="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-[10px] text-indigo-600 font-bold uppercase">
                    {task.agentId?.charAt(0) || 'A'}
                  </div>
                  <span class="text-gray-700 font-medium text-xs truncate max-w-[100px]">{task.agentId}</span>
                </div>
              </td>
              <td class="px-5 py-3 text-xs text-gray-600 max-w-xs">
                <div class="truncate group-hover:whitespace-normal group-hover:break-words">
                  {task.task.includes('<thought>') ? (
                    <div class="space-y-1">
                      <div class="text-[10px] text-gray-400 italic bg-gray-50 p-2 rounded border-l-2 border-gray-200">
                        {task.task.match(/<thought>([\s\S]*?)<\/thought>/)?.[1] || 'Thinking...'}
                      </div>
                      <div class="text-[#175B37] font-medium">
                        {task.task.replace(/<thought>[\s\S]*?<\/thought>/g, '').trim()}
                      </div>
                    </div>
                  ) : (
                    task.task
                  )}
                </div>
              </td>
              <td class="px-5 py-3 text-center">
                <StatusBadge status={task.status} />
              </td>
              <td class="px-5 py-3 text-right whitespace-nowrap text-[10px] text-gray-400 font-mono">
                {new Date(task.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
