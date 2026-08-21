import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';

interface Connection {
  id: string;
  name: string;
  type: 'github' | 'gitlab' | 'docker' | 'database';
  status: 'connected' | 'disconnected';
}

interface Token {
  id: string;
  name: string;
  lastUsed?: string;
  createdAt: string;
}

interface Props {
  searchParams: URLSearchParams;
  navigate: (path: string) => void;
}

export default function ConnexionsPage({ searchParams, navigate }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/connections').then(r => r.json()).catch(() => ({ connections: [] })),
      fetch('/api/tokens').then(r => r.json()).catch(() => ({ tokens: [] })),
    ]).then(([connData, tokenData]) => {
      setConnections(connData.connections || []);
      setTokens(tokenData.tokens || []);
      setLoading(false);
    });
  }, []);

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

  return (
    <div class="dashboard-content">
      <div class="page-header">
        <h1 class="text-3xl font-bold text-gray-900">Connexions</h1>
        <p class="text-sm text-gray-500 mt-1">Gérez vos connexions et clés API</p>
      </div>

      <div class="space-y-6">
        <div class="card">
          <div class="p-4 border-b">
            <h2 class="text-lg font-semibold">Connexions externes</h2>
            <p class="text-sm text-gray-500 mt-1">Services et intégrations connectés</p>
          </div>
          <div class="divide-y">
            {connections.length === 0 ? (
              <div class="p-8 text-center text-gray-500">
                Aucune connexion configurée.
              </div>
            ) : (
              connections.map(conn => (
                <div key={conn.id} class="p-4 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <div class={`w-3 h-3 rounded-full ${conn.status === 'connected' ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                    <div>
                      <h3 class="font-medium">{conn.name}</h3>
                      <p class="text-sm text-gray-500 capitalize">{conn.type}</p>
                    </div>
                  </div>
                  <span class={`px-3 py-1 text-xs font-medium rounded ${
                    conn.status === 'connected' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {conn.status === 'connected' ? 'Connecté' : 'Déconnecté'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div class="card">
          <div class="p-4 border-b flex items-center justify-between">
            <div>
              <h2 class="text-lg font-semibold">Tokens & Clés API</h2>
              <p class="text-sm text-gray-500 mt-1">Authentification et accès programmatique</p>
            </div>
            <button class="btn btn-primary btn-sm">
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
              </svg>
              Nouveau token
            </button>
          </div>
          <div class="divide-y">
            {tokens.length === 0 ? (
              <div class="p-8 text-center text-gray-500">
                Aucun token créé.
              </div>
            ) : (
              tokens.map(token => (
                <div key={token.id} class="p-4 flex items-center justify-between">
                  <div>
                    <h3 class="font-medium">{token.name}</h3>
                    <p class="text-sm text-gray-500">
                      Créé le {new Date(token.createdAt).toLocaleDateString('fr-FR')}
                      {token.lastUsed && ` • Utilisé le ${new Date(token.lastUsed).toLocaleDateString('fr-FR')}`}
                    </p>
                  </div>
                  <button class="btn btn-ghost btn-sm text-red-600">Révoquer</button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
