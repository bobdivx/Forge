import { useState, useEffect } from 'preact/hooks';

export type ForgeModule = {
  id: number;
  identifier: string;
  name: string;
  description: string;
  version: string;
  installed: number;
  published: number;
  isMcp?: number;
  mcpUrl?: string;
  payload: string;
  createdAt: string;
  updatedAt: string;
};

export default function ModuleStoreTab() {
  const [modules, setModules] = useState<ForgeModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchModules = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/modules');
      if (!res.ok) throw new Error('Erreur réseau');
      const data = await res.json();
      setModules(data.modules || []);
    } catch (e: any) {
      setError(e.message || 'Erreur lors du chargement des modules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchModules();
  }, []);

  const toggleInstall = async (mod: ForgeModule) => {
    const isInstalled = mod.installed === 1;
    const nextState = !isInstalled;
    try {
      const res = await fetch('/api/modules/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mod.id, installed: nextState }),
      });
      if (!res.ok) throw new Error('Erreur lors de la modification');
      const data = await res.json();
      setModules((prev) => prev.map((m) => (m.id === mod.id ? { ...m, installed: nextState ? 1 : 0 } : m)));
    } catch (e: any) {
      alert(e.message);
    }
  };

  if (loading) {
    return <div className="p-4 text-gray-400">Chargement du store...</div>;
  }

  if (error) {
    return <div className="p-4 text-red-500">Erreur : {error}</div>;
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Store de Modules</h2>
        <p className="text-sm text-gray-400">
          Installez ou désinstallez des modules métiers (GitHub, Vercel, Docker, etc.). Les agents peuvent aussi publier leurs propres modules.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {modules.length === 0 ? (
          <div className="col-span-full p-8 text-center text-gray-500 border border-gray-800 rounded-xl bg-gray-900/50">
            Aucun module disponible dans le store.
          </div>
        ) : (
          modules.map((mod) => (
            <div key={mod.id} className="flex flex-col bg-gray-900 border border-gray-800 rounded-xl p-5 hover:border-gray-700 transition-colors">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                    {mod.name}
                    {mod.isMcp === 1 && (
                      <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded bg-purple-900/30 text-purple-400 border border-purple-800/50" title="Model Context Protocol">
                        MCP
                      </span>
                    )}
                  </h3>
                  <span className="text-xs text-gray-500 font-mono">{mod.identifier} • v{mod.version}</span>
                </div>
                {mod.published === 1 && (
                  <span className="px-2 py-1 text-xs font-medium rounded-full bg-blue-900/50 text-blue-400 border border-blue-800/50">
                    Publié
                  </span>
                )}
              </div>

              <p className="text-sm text-gray-400 flex-grow mb-2">
                {mod.description || 'Aucune description fournie.'}
              </p>

              {mod.isMcp === 1 && mod.mcpUrl && (
                <div className="mb-4 text-xs font-mono text-purple-400/80 bg-purple-900/10 px-2 py-1 rounded truncate">
                  {mod.mcpUrl}
                </div>
              )}

              <div className="flex justify-end pt-3 border-t border-gray-800">
                <button
                  onClick={() => toggleInstall(mod)}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37] ${
                    mod.installed === 1
                      ? 'bg-red-900/20 text-red-400 hover:bg-red-900/40 border border-red-900/50'
                      : 'bg-[#175B37] text-white hover:bg-[#1A6A40]'
                  }`}
                >
                  {mod.installed === 1 ? 'Désinstaller' : 'Installer'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
