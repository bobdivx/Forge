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

interface ModuleStoreTabProps {
  onSelectModule: (mod: ForgeModule) => void;
}

// Fonction utilitaire pour obtenir le logo SVG du module
function getModuleIcon(identifier: string, isMcp: boolean, accentColor?: string) {
  if (identifier === 'module-github') {
    return (
      <svg className="w-10 h-10 text-gray-900" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
      </svg>
    );
  }
  if (identifier === 'module-docker') {
    return (
      <svg className="w-10 h-10 text-[#0db7ed]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.983 11.078h2.119c.102 0 .186-.084.186-.186V8.773c0-.102-.084-.186-.186-.186h-2.119c-.102 0-.186.084-.186.186v2.119c0 .101.085.186.186.186zm-2.958-3.098h2.119c.102 0 .186-.084.186-.186V5.674c0-.102-.084-.186-.186-.186h-2.119c-.102 0-.186.084-.186.186v2.119c0 .102.085.186.186.186zm0 3.098h2.119c.102 0 .186-.084.186-.186V8.773c0-.102-.084-.186-.186-.186h-2.119c-.102 0-.186.084-.186.186v2.119c0 .101.085.186.186.186zm-2.958 0h2.119c.103 0 .186-.084.186-.186V8.773c0-.102-.083-.186-.186-.186H8.067c-.103 0-.186.084-.186.186v2.119c0 .101.083.186.186.186zm-2.957 0h2.119c.103 0 .186-.084.186-.186V8.773c0-.102-.083-.186-.186-.186H5.11c-.103 0-.186.084-.186.186v2.119c0 .101.083.186.186.186zm-2.957 0h2.119c.103 0 .186-.084.186-.186V8.773c0-.102-.083-.186-.186-.186H2.153c-.103 0-.186.084-.186.186v2.119c0 .101.083.186.186.186zm11.831-3.098h2.119c.102 0 .186-.084.186-.186V5.674c0-.102-.084-.186-.186-.186h-2.119c-.102 0-.186.084-.186.186v2.119c0 .102.085.186.186.186zm-2.958 0h2.119c.102 0 .186-.084.186-.186V5.674c0-.102-.084-.186-.186-.186h-2.119c-.102 0-.186.084-.186.186v2.119c0 .102.085.186.186.186zm-2.958 0h2.119c.103 0 .186-.084.186-.186V5.674c0-.102-.083-.186-.186-.186H8.067c-.103 0-.186.084-.186.186v2.119c0 .102.083.186.186.186zm-2.957 0h2.119c.103 0 .186-.084.186-.186V5.674c0-.102-.083-.186-.186-.186H5.11c-.103 0-.186.084-.186.186v2.119c0 .102.083.186.186.186zM12.183 16.91c-5.454 0-6.168-4.004-6.168-4.004h11.978s-.252 4.004-5.81 4.004zm11.812-4.996c-.461-.375-1.503-.473-2.228-.518-.079-.17-.189-.35-.337-.532.747-.537 1.547-1.127 1.229-1.849-.247-.562-1.391-.326-2.127-.145-.192-.224-.442-.458-.752-.693.385-.815.795-1.745.228-2.24-.549-.479-1.229.431-1.693 1.054a10.05 10.05 0 00-.913-.42c-.027-.923-.105-1.954-.761-2.121-.645-.164-1.026.839-1.246 1.706-.341.011-.703.048-1.077.112-.341-.758-.871-1.637-1.564-1.51-.716.13-.809 1.139-.77 2.052a11.758 11.758 0 00-1.25.688c-.624-.627-1.428-1.258-2.029-.913-.578.332-.239 1.298.058 2.072-.259.223-.487.463-.68.718-.767-.145-1.716-.279-2.096.223-.362.48.333 1.096.953 1.52-.097.165-.179.336-.248.513-.77.108-1.719.336-1.97.872-.279.593.684.908 1.488 1.053-.021.144-.029.289-.029.436C.002 11.597 0 17.659 0 17.659c0 1.25 1.012 2.261 2.262 2.261h13.921c5.202 0 9.421-4.103 9.771-9.281l.041-.699v-.026zm-2.026 2.032c-.083.003-.162-.03-.213-.093-.052-.063-.069-.147-.046-.225a.82.82 0 01.378-.475c.08-.046.177-.042.253.01.076.052.115.143.102.235a.823.823 0 01-.474.548z"/>
      </svg>
    );
  }
  if (identifier === 'module-vercel') {
    return (
      <svg className="w-10 h-10 text-black" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 22.525H0L12 1.475z"/>
      </svg>
    );
  }
  if (identifier === 'module-pet') {
    return (
      <div className="w-10 h-10 rounded-full bg-[#175B37]/10 flex items-center justify-center text-3xl">
        👾
      </div>
    );
  }
  if (identifier === 'module-turso') {
    return (
      <svg className="w-10 h-10 text-[#4bc5bd]" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2C6.48 2 2 4.02 2 6.5s4.48 4.5 10 4.5 10-2.02 10-4.5S17.52 2 12 2zm0 11c-4.96 0-9-1.64-9-3.5V13c0 1.86 4.04 3.5 9 3.5s9-1.64 9-3.5v-3.5c0 1.86-4.04 3.5-9 3.5zm0 5c-4.96 0-9-1.64-9-3.5V18c0 1.86 4.04 3.5 9 3.5s9-1.64 9-3.5v-3.5c0 1.86-4.04 3.5-9 3.5z"/>
      </svg>
    );
  }

  // MCP / Custom logo
  return (
    <div 
      className="w-10 h-10 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-inner"
      style={{ backgroundColor: accentColor || '#7c3aed' }}
    >
      {isMcp ? '🔌' : '📦'}
    </div>
  );
}

export default function ModuleStoreTab({ onSelectModule }: ModuleStoreTabProps) {
  const [modules, setModules] = useState<ForgeModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // States pour la création de module / MCP
  const [modalOpen, setModalOpen] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [version, setVersion] = useState('1.0.0');
  const [isMcp, setIsMcp] = useState(false);
  const [mcpUrl, setMcpUrl] = useState('');
  const [payload, setPayload] = useState('{}');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchModules = async () => {
    setLoading(false);
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
    setLoading(true);
    fetchModules();
  }, []);

  const toggleInstall = async (e: Event, mod: ForgeModule) => {
    e.stopPropagation(); // Évite d'ouvrir la vue détaillée
    const isInstalled = mod.installed === 1;
    const nextState = !isInstalled;
    try {
      const res = await fetch('/api/modules/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: mod.id, installed: nextState }),
      });
      if (!res.ok) throw new Error('Erreur lors de la modification');
      setModules((prev) => prev.map((m) => (m.id === mod.id ? { ...m, installed: nextState ? 1 : 0 } : m)));
    } catch (e: any) {
      alert(e.message);
    }
  };

  const handleCreate = async (e: Event) => {
    e.preventDefault();
    if (!identifier.trim() || !name.trim()) {
      setSubmitError('L\'identifiant et le nom sont requis.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/modules/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: identifier.trim(),
          name: name.trim(),
          description: description.trim(),
          version: version.trim(),
          isMcp: isMcp ? 1 : 0,
          mcpUrl: isMcp ? mcpUrl.trim() : null,
          payload: payload.trim(),
          published: 1,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la création');

      setModalOpen(false);
      setIdentifier('');
      setName('');
      setDescription('');
      setVersion('1.0.0');
      setIsMcp(false);
      setMcpUrl('');
      setPayload('{}');

      fetchModules();
    } catch (e: any) {
      setSubmitError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-gray-400">Chargement du store...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">Erreur : {error}</div>;
  }

  return (
    <div className="space-y-6 text-gray-800 text-left">
      {/* En-tête du Store */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Store de Plugins & Modules</h2>
          <p className="text-xs text-gray-500">
            Parcourez la galerie des extensions disponibles. Cliquez sur une carte pour configurer le plugin en détail.
          </p>
        </div>
        <button
          onClick={() => {
            setSubmitError(null);
            setModalOpen(true);
          }}
          className="shrink-0 px-4 py-2 text-xs font-bold text-white bg-[#175B37] hover:bg-[#124a2c] rounded-xl transition-colors shadow-sm"
        >
          + Publier un module / MCP
        </button>
      </div>

      {/* Grille de Cartes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {modules.length === 0 ? (
          <div className="col-span-full p-12 text-center text-gray-400 border border-dashed border-gray-200 rounded-3xl bg-gray-50">
            Aucun module disponible dans le store.
          </div>
        ) : (
          modules.map((mod) => {
            const isInstalled = mod.installed === 1;
            return (
              <div
                key={mod.id}
                onClick={() => onSelectModule(mod)}
                className={`group flex flex-col bg-white border border-gray-150 rounded-[2rem] p-6 hover:border-gray-300 hover:shadow-md transition-all duration-200 cursor-pointer text-left relative overflow-hidden`}
              >
                {/* En-tête de carte */}
                <div className="flex items-start justify-between gap-4 mb-4">
                  {getModuleIcon(mod.identifier, mod.isMcp === 1)}
                  <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide border ${
                    isInstalled 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-gray-50 text-gray-400 border-gray-200'
                  }`}>
                    {isInstalled ? 'Activé' : 'Disponible'}
                  </span>
                </div>

                {/* Contenu */}
                <div className="flex-1 space-y-1 mb-5">
                  <h3 className="text-base font-bold text-gray-900 group-hover:text-[#175B37] transition-colors flex items-center gap-1.5">
                    {mod.name}
                    {mod.isMcp === 1 && (
                      <span className="px-1.5 py-0.2 text-[8px] uppercase font-black bg-purple-50 text-purple-700 border border-purple-200 rounded">
                        MCP
                      </span>
                    )}
                  </h3>
                  <div className="text-[10px] text-gray-400 font-mono tracking-tight">
                    {mod.identifier} • v{mod.version}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed pt-2 line-clamp-3">
                    {mod.description || 'Aucune description.'}
                  </p>
                </div>

                {/* Footer de carte */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-100 mt-auto">
                  <span className="text-[10px] font-bold text-gray-400 group-hover:text-gray-900 transition-colors">
                    Configurer →
                  </span>
                  <button
                    onClick={(e) => toggleInstall(e, mod)}
                    className={`px-3 py-1.5 text-[10px] font-bold rounded-xl transition-all shadow-sm ${
                      isInstalled
                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        : 'bg-[#175B37] text-white hover:bg-[#124a2c]'
                    }`}
                  >
                    {isInstalled ? 'Désactiver' : 'Activer'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Modal Publier un module / MCP */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-xl bg-white border border-gray-100 rounded-3xl p-6 shadow-2xl space-y-5 text-left">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-bold text-gray-900">Publier un nouveau module / MCP</h3>
              <button 
                onClick={() => setModalOpen(false)} 
                className="text-gray-400 hover:text-gray-600 text-xs transition-colors"
              >
                Fermer
              </button>
            </div>

            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Identifiant technique</label>
                  <input
                    type="text"
                    placeholder="ex: github-watcher"
                    value={identifier}
                    onInput={(e) => setIdentifier((e.target as HTMLInputElement).value)}
                    className="w-full bg-gray-50 border border-gray-250 rounded-xl px-4 py-2 text-sm text-gray-900 focus:bg-white focus:border-[#175B37] outline-none transition-all font-mono shadow-inner"
                    required
                  />
                </div>
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Nom affiché</label>
                  <input
                    type="text"
                    placeholder="ex: GitHub Watcher"
                    value={name}
                    onInput={(e) => setName((e.target as HTMLInputElement).value)}
                    className="w-full bg-gray-50 border border-gray-250 rounded-xl px-4 py-2 text-sm text-gray-900 focus:bg-white focus:border-[#175B37] outline-none transition-all shadow-inner"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Description</label>
                <textarea
                  placeholder="Expliquez ce que fait ce module..."
                  value={description}
                  onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
                  className="w-full bg-gray-50 border border-gray-255 rounded-xl px-4 py-2 text-sm text-gray-900 focus:bg-white focus:border-[#175B37] outline-none transition-all min-h-[60px] shadow-inner"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5 col-span-2 sm:col-span-1">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Version</label>
                  <input
                    type="text"
                    placeholder="1.0.0"
                    value={version}
                    onInput={(e) => setVersion((e.target as HTMLInputElement).value)}
                    className="w-full bg-gray-50 border border-gray-250 rounded-xl px-4 py-2 text-sm text-gray-900 focus:bg-white focus:border-[#175B37] outline-none transition-all font-mono shadow-inner"
                  />
                </div>
                
                <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl col-span-2 sm:col-span-1">
                  <div>
                    <label className="block text-xs font-bold text-gray-800">Serveur MCP</label>
                    <span className="text-[10px] text-gray-500">Intégration Model Context Protocol</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMcp(!isMcp)}
                    className={`relative inline-flex h-6.5 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      isMcp ? 'bg-[#175B37]' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isMcp ? 'translate-x-4.5' : 'translate-x-0'}`} />
                  </button>
                </div>
              </div>

              {isMcp && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">URL du serveur MCP</label>
                  <input
                    type="url"
                    placeholder="http://host.docker.internal:3000/sse"
                    value={mcpUrl}
                    onInput={(e) => setMcpUrl((e.target as HTMLInputElement).value)}
                    className="w-full bg-gray-50 border border-gray-250 rounded-xl px-4 py-2 text-sm text-gray-900 focus:bg-white focus:border-[#175B37] outline-none transition-all font-mono shadow-inner"
                    required={isMcp}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Configuration Payload (JSON)</label>
                <textarea
                  placeholder="{}"
                  value={payload}
                  onInput={(e) => setPayload((e.target as HTMLTextAreaElement).value)}
                  className="w-full bg-gray-50 border border-gray-250 rounded-xl px-4 py-2 text-xs text-gray-900 focus:bg-white focus:border-[#175B37] outline-none transition-all font-mono min-h-[60px] shadow-inner"
                />
              </div>

              {submitError && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 p-3 rounded-xl">
                  {submitError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#175B37] hover:bg-[#124a2c] rounded-xl transition-colors shadow-md disabled:opacity-50"
                >
                  {submitting ? 'Publication...' : 'Publier le module'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
