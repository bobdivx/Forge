import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface Application {
  id: string;
  name: string;
  status: 'healthy' | 'warning' | 'error' | 'stopped';
  url?: string;
  buildStatus?: string;
}

interface Props {
  searchParams: URLSearchParams;
  navigate: (path: string) => void;
}

export default function ApplicationsPage({ searchParams, navigate }: Props) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');

  useEffect(() => {
    fetch('/api/apps')
      .then(res => res.json())
      .then(data => {
        setApplications(data.applications || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filteredApps = applications.filter(app =>
    app.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    const newPath = value ? `/applications/?q=${encodeURIComponent(value)}` : '/applications/';
    navigate(newPath);
  };

  const healthyCount = applications.filter(a => a.status === 'healthy').length;
  const totalCount = applications.length;

  return (
    <div class="dashboard-content">
      <div class="page-header">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Applications</h1>
          <p class="text-sm text-gray-500 mt-1">
            {healthyCount} / {totalCount} en ligne • {filteredApps.length} affichées
          </p>
        </div>
        <button class="btn btn-primary">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
          </svg>
          Nouvelle application
        </button>
      </div>

      <div class="card">
        <div class="p-4 border-b">
          <input
            type="search"
            value={searchQuery}
            onInput={(e) => handleSearch((e.target as HTMLInputElement).value)}
            placeholder="Rechercher une application…"
            class="w-full px-4 py-2 border rounded-lg"
          />
        </div>

        {loading ? (
          <div class="p-8 text-center">
            <div class="loading loading-spinner"></div>
            <p class="mt-2 text-gray-500">Chargement…</p>
          </div>
        ) : filteredApps.length === 0 ? (
          <div class="p-8 text-center">
            <p class="text-gray-500">
              {searchQuery ? `Aucune application ne correspond à "${searchQuery}".` : 'Aucune application trouvée.'}
            </p>
          </div>
        ) : (
          <div class="divide-y">
            {filteredApps.map(app => (
              <div key={app.id} class="p-4 hover:bg-gray-50 cursor-pointer" onClick={() => navigate(`/applications/${app.id}/`)}>
                <div class="flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class={`w-3 h-3 rounded-full ${
                      app.status === 'healthy' ? 'bg-green-500' :
                      app.status === 'warning' ? 'bg-yellow-500' :
                      app.status === 'error' ? 'bg-red-500' :
                      'bg-gray-400'
                    }`}></div>
                    <div>
                      <h3 class="font-semibold text-gray-900">{app.name}</h3>
                      {app.url && (
                        <a
                          href={app.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          class="text-sm text-blue-600 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {app.url}
                        </a>
                      )}
                    </div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class={`px-2 py-1 text-xs font-medium rounded ${
                      app.status === 'healthy' ? 'bg-green-100 text-green-800' :
                      app.status === 'warning' ? 'bg-yellow-100 text-yellow-800' :
                      app.status === 'error' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {app.status === 'healthy' ? 'En ligne' :
                       app.status === 'warning' ? 'Avertissement' :
                       app.status === 'error' ? 'Erreur' :
                       'Arrêtée'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
