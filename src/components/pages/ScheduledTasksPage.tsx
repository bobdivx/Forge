import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface ScheduledTask {
  id: string;
  name: string;
  schedule: string;
  command: string;
  enabled: boolean;
  lastRun?: string;
}

interface Props {
  searchParams: URLSearchParams;
  navigate: (path: string) => void;
}

function maskBearerTokens(command: string): string {
  return command.replace(/Bearer\s+[A-Za-z0-9_\-\.]+/g, 'Bearer ████████████');
}

export default function ScheduledTasksPage({ searchParams, navigate }: Props) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/scheduled-tasks')
      .then(res => res.json())
      .then(data => {
        setTasks(data.tasks || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div class="dashboard-content">
      <div class="page-header">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Tâches planifiées</h1>
          <p class="text-sm text-gray-500 mt-1">
            {tasks.filter(t => t.enabled).length} actives • {tasks.length} au total
          </p>
        </div>
        <button class="btn btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Nouvelle tâche
        </button>
      </div>

      <div class="card">
        {loading ? (
          <div class="p-8 text-center">
            <div class="loading loading-spinner"></div>
            <p class="mt-2 text-gray-500">Chargement…</p>
          </div>
        ) : tasks.length === 0 ? (
          <div class="p-8 text-center text-gray-500">
            Aucune tâche planifiée.
          </div>
        ) : (
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="border-b bg-gray-50">
                <tr>
                  <th class="text-left p-4 font-semibold">Nom</th>
                  <th class="text-left p-4 font-semibold">Planning</th>
                  <th class="text-left p-4 font-semibold">Commande</th>
                  <th class="text-left p-4 font-semibold">Statut</th>
                  <th class="text-left p-4 font-semibold">Dernière exécution</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                {tasks.map(task => (
                  <tr key={task.id} class="hover:bg-gray-50">
                    <td class="p-4 font-medium text-gray-900">{task.name}</td>
                    <td class="p-4 text-sm text-gray-600 font-mono">{task.schedule}</td>
                    <td class="p-4">
                      <code class="text-xs bg-gray-100 px-2 py-1 rounded font-mono block overflow-x-auto max-w-md">
                        {maskBearerTokens(task.command)}
                      </code>
                    </td>
                    <td class="p-4">
                      <span class={`px-2 py-1 text-xs font-medium rounded ${
                        task.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {task.enabled ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td class="p-4 text-sm text-gray-600">
                      {task.lastRun ? new Date(task.lastRun).toLocaleString('fr-FR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div class="card mt-4 p-4 bg-yellow-50 border border-yellow-200">
        <div class="flex gap-2">
          <svg class="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
          </svg>
          <div>
            <h3 class="font-semibold text-yellow-900 mb-1">Sécurité</h3>
            <p class="text-sm text-yellow-800">
              Les tokens et secrets sont automatiquement masqués dans l'affichage. 
              Les commandes contenant <code class="bg-yellow-100 px-1 rounded">Bearer</code> suivi d'un token 
              ne montrent jamais le token complet pour des raisons de sécurité.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
