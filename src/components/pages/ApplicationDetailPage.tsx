import { h } from 'preact';
import { useState, useEffect, useRef } from 'preact/hooks';

interface Props {
  appSlug: string;
  searchParams: URLSearchParams;
  navigate: (path: string) => void;
}

export default function ApplicationDetailPage({ appSlug, searchParams, navigate }: Props) {
  const [app, setApp] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const activeTab = searchParams.get('tab') || 'overview';

  useEffect(() => {
    fetch(`/api/apps/${appSlug}`)
      .then(res => res.json())
      .then(data => {
        setApp(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [appSlug]);

  useEffect(() => {
    if (activeTab === 'logs' && app) {
      setLogsLoading(true);
      setLogs([]);

      fetch(`/api/apps/${appSlug}/logs`)
        .then(res => res.json())
        .then(data => {
          setLogs(data.logs || []);
          setLogsLoading(false);
        })
        .catch(() => {
          setLogs(['Erreur lors du chargement des logs.']);
          setLogsLoading(false);
        });

      if (window.EventSource) {
        const eventSource = new EventSource(`/api/apps/${appSlug}/logs/stream`);
        eventSource.onmessage = (event) => {
          const newLog = event.data;
          setLogs(prev => [...prev, newLog]);
        };
        eventSource.onerror = () => {
          console.error('EventSource error');
        };
        eventSourceRef.current = eventSource;

        return () => {
          eventSource.close();
        };
      }
    }
  }, [activeTab, appSlug, app]);

  useEffect(() => {
    if (activeTab === 'logs' && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, activeTab]);

  if (loading) {
    return (
      <div class="dashboard-content">
        <div class="flex items-center justify-center min-h-[400px]">
          <div class="loading loading-spinner"></div>
          <span class="ml-3">Chargement…</span>
        </div>
      </div>
    );
  }

  if (!app) {
    return (
      <div class="dashboard-content">
        <div class="card p-8 text-center">
          <h2 class="text-2xl font-bold text-gray-900 mb-2">Ressource introuvable</h2>
          <p class="text-gray-600 mb-4">L'application demandée n'existe pas ou a été supprimée.</p>
          <button onClick={() => navigate('/applications/')} class="btn btn-primary">
            ← Retour aux applications
          </button>
        </div>
      </div>
    );
  }

  return (
    <div class="dashboard-content">
      <div class="mb-4">
        <button onClick={() => navigate('/applications/')} class="text-sm text-gray-600 hover:text-gray-900 mb-2">
          ← Retour aux applications
        </button>
        <h1 class="text-3xl font-bold text-gray-900">{app.name}</h1>
      </div>

      <div class="card">
        <div class="border-b">
          <div class="flex gap-4 px-4">
            {['overview', 'logs', 'settings'].map(tab => (
              <button
                key={tab}
                onClick={() => navigate(`/applications/${appSlug}/?tab=${tab}`)}
                class={`py-3 px-2 border-b-2 font-medium text-sm ${
                  activeTab === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab === 'overview' ? 'Vue d\'ensemble' : tab === 'logs' ? 'Journaux' : 'Paramètres'}
              </button>
            ))}
          </div>
        </div>

        <div class="p-4">
          {activeTab === 'overview' && (
            <div class="space-y-4">
              <div>
                <h3 class="font-semibold mb-2">Statut</h3>
                <span class={`px-3 py-1 rounded text-sm ${
                  app.status === 'healthy' ? 'bg-green-100 text-green-800' :
                  app.status === 'error' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {app.status === 'healthy' ? 'En ligne' : app.status === 'error' ? 'Erreur' : 'Arrêtée'}
                </span>
              </div>
              {app.url && (
                <div>
                  <h3 class="font-semibold mb-2">URL</h3>
                  <a href={app.url} target="_blank" rel="noopener noreferrer" class="text-blue-600 hover:underline">
                    {app.url}
                  </a>
                </div>
              )}
            </div>
          )}

          {activeTab === 'logs' && (
            <div>
              {logsLoading ? (
                <div class="flex items-center justify-center py-8">
                  <div class="loading loading-spinner"></div>
                  <span class="ml-3">Chargement des journaux…</span>
                </div>
              ) : (
                <div class="bg-gray-900 text-gray-100 p-4 rounded font-mono text-sm overflow-auto" style="max-height: 500px;">
                  {logs.length === 0 ? (
                    <p class="text-gray-400">Aucun journal disponible.</p>
                  ) : (
                    logs.map((log, i) => (
                      <div key={i} class="whitespace-pre-wrap">{log}</div>
                    ))
                  )}
                  <div ref={logsEndRef}></div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'settings' && (
            <div>
              <p class="text-gray-600">Paramètres de l'application</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
