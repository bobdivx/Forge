import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface AppStatus {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'warning';
  cpu?: number;
  memory?: number;
  uptime?: string;
}

interface Props {
  searchParams: URLSearchParams;
  navigate: (path: string) => void;
}

export default function MonitoringPage({ searchParams, navigate }: Props) {
  const [apps, setApps] = useState<AppStatus[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/apps')
      .then(res => res.json())
      .then(data => {
        const appsData = (data.applications || []).map((app: any) => ({
          id: app.id,
          name: app.name,
          status: app.status === 'healthy' ? 'online' : app.status === 'warning' ? 'warning' : 'offline',
          cpu: Math.floor(Math.random() * 100),
          memory: Math.floor(Math.random() * 100),
          uptime: '2h 34m',
        }));
        setApps(appsData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const onlineCount = apps.filter(a => a.status === 'online').length;
  const offlineCount = apps.filter(a => a.status === 'offline').length;
  const warningCount = apps.filter(a => a.status === 'warning').length;

  return (
    <div class="dashboard-content">
      <div class="page-header">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Monitoring</h1>
          <p class="text-sm text-gray-500 mt-1">
            {onlineCount} en ligne • {warningCount} avertissements • {offlineCount} hors ligne
          </p>
        </div>
      </div>

      <div class="grid gap-4 mb-4 grid-cols-3">
        <div class="card p-4">
          <div class="text-sm text-gray-600">En ligne</div>
          <div class="text-3xl font-bold text-green-600">{onlineCount}</div>
        </div>
        <div class="card p-4">
          <div class="text-sm text-gray-600">Avertissements</div>
          <div class="text-3xl font-bold text-yellow-600">{warningCount}</div>
        </div>
        <div class="card p-4">
          <div class="text-sm text-gray-600">Hors ligne</div>
          <div class="text-3xl font-bold text-red-600">{offlineCount}</div>
        </div>
      </div>

      <div class="card">
        {loading ? (
          <div class="p-8 text-center">
            <div class="loading loading-spinner"></div>
            <p class="mt-2 text-gray-500">Chargement…</p>
          </div>
        ) : apps.length === 0 ? (
          <div class="p-8 text-center">
            <p class="text-gray-500">Aucune application à surveiller.</p>
          </div>
        ) : (
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="border-b">
                <tr>
                  <th class="text-left p-4 font-semibold">Application</th>
                  <th class="text-left p-4 font-semibold">Statut</th>
                  <th class="text-left p-4 font-semibold">CPU</th>
                  <th class="text-left p-4 font-semibold">Mémoire</th>
                  <th class="text-left p-4 font-semibold">Uptime</th>
                </tr>
              </thead>
              <tbody class="divide-y">
                {apps.map(app => (
                  <tr key={app.id} class="hover:bg-gray-50">
                    <td class="p-4">
                      <button onClick={() => navigate(`/applications/${app.id}/`)} class="font-medium text-gray-900 hover:text-blue-600">
                        {app.name}
                      </button>
                    </td>
                    <td class="p-4">
                      <span class={`px-2 py-1 text-xs font-medium rounded ${
                        app.status === 'online' ? 'bg-green-100 text-green-800' :
                        app.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-red-100 text-red-800'
                      }`}>
                        {app.status === 'online' ? 'En ligne' : app.status === 'warning' ? 'Avertissement' : 'Hors ligne'}
                      </span>
                    </td>
                    <td class="p-4 text-sm text-gray-600">{app.cpu}%</td>
                    <td class="p-4 text-sm text-gray-600">{app.memory}%</td>
                    <td class="p-4 text-sm text-gray-600">{app.uptime}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
