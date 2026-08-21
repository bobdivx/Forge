import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface Deployment {
  id: string;
  appName: string;
  url?: string;
  status: 'reachable' | 'unreachable' | 'checking';
  lastCheck?: string;
}

interface Props {
  searchParams: URLSearchParams;
  navigate: (path: string) => void;
}

export default function DeploymentsPage({ searchParams, navigate }: Props) {
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/apps')
      .then(res => res.json())
      .then(data => {
        const apps = data.applications || [];
        const deploymentsData = apps.map((app: any) => ({
          id: app.id,
          appName: app.name,
          url: app.url,
          status: 'checking' as const,
          lastCheck: undefined,
        }));
        setDeployments(deploymentsData);

        deploymentsData.forEach((dep: Deployment) => {
          if (dep.url) {
            checkUrlReachability(dep.id, dep.url);
          } else {
            updateDeploymentStatus(dep.id, 'unreachable', 'Pas d\'URL configurée');
          }
        });

        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const checkUrlReachability = async (id: string, url: string) => {
    try {
      const response = await fetch(`/api/check-url?url=${encodeURIComponent(url)}`);
      const data = await response.json();
      const isReachable = data.reachable === true;
      const timestamp = new Date().toLocaleTimeString('fr-FR');
      updateDeploymentStatus(id, isReachable ? 'reachable' : 'unreachable', timestamp);
    } catch {
      updateDeploymentStatus(id, 'unreachable', 'Erreur de vérification');
    }
  };

  const updateDeploymentStatus = (id: string, status: 'reachable' | 'unreachable', lastCheck: string) => {
    setDeployments(prev =>
      prev.map(dep => (dep.id === id ? { ...dep, status, lastCheck } : dep))
    );
  };

  const reachableCount = deployments.filter(d => d.status === 'reachable').length;
  const unreachableCount = deployments.filter(d => d.status === 'unreachable').length;
  const checkingCount = deployments.filter(d => d.status === 'checking').length;

  return (
    <div class="dashboard-content">
      <div class="page-header">
        <div>
          <h1 class="text-3xl font-bold text-gray-900">Déploiements</h1>
          <p class="text-sm text-gray-500 mt-1">
            {reachableCount} joignables • {unreachableCount} en alerte
            {checkingCount > 0 && ` • ${checkingCount} en cours de vérification`}
          </p>
        </div>
      </div>

      <div class="grid gap-4 mb-4 grid-cols-3">
        <div class="card p-4">
          <div class="text-sm text-gray-600">Joignables</div>
          <div class="text-3xl font-bold text-green-600">{reachableCount}</div>
        </div>
        <div class="card p-4">
          <div class="text-sm text-gray-600">En alerte</div>
          <div class="text-3xl font-bold text-red-600">{unreachableCount}</div>
        </div>
        <div class="card p-4">
          <div class="text-sm text-gray-600">Total</div>
          <div class="text-3xl font-bold text-gray-900">{deployments.length}</div>
        </div>
      </div>

      <div class="card">
        {loading ? (
          <div class="p-8 text-center">
            <div class="loading loading-spinner"></div>
            <p class="mt-2 text-gray-500">Chargement…</p>
          </div>
        ) : deployments.length === 0 ? (
          <div class="p-8 text-center">
            <p class="text-gray-500">Aucun déploiement trouvé.</p>
          </div>
        ) : (
          <div class="divide-y">
            {deployments.map(dep => (
              <div key={dep.id} class="p-4 hover:bg-gray-50">
                <div class="flex items-center justify-between">
                  <div>
                    <h3 class="font-semibold text-gray-900">{dep.appName}</h3>
                    {dep.url && (
                      <a
                        href={dep.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        class="text-sm text-blue-600 hover:underline"
                      >
                        {dep.url}
                      </a>
                    )}
                    {dep.lastCheck && (
                      <p class="text-xs text-gray-400 mt-1">Dernière vérification : {dep.lastCheck}</p>
                    )}
                  </div>
                  <div>
                    {dep.status === 'checking' ? (
                      <span class="px-3 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800">
                        Vérification…
                      </span>
                    ) : dep.status === 'reachable' ? (
                      <span class="px-3 py-1 text-xs font-medium rounded bg-green-100 text-green-800">
                        Joignable
                      </span>
                    ) : (
                      <span class="px-3 py-1 text-xs font-medium rounded bg-red-100 text-red-800">
                        URL inaccessible
                      </span>
                    )}
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
