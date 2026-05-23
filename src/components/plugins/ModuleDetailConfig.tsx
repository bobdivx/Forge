import { useState, useEffect } from 'preact/hooks';
import type { ForgeModule } from '../settings/ModuleStoreTab';

interface ModuleDetailConfigProps {
  module: ForgeModule;
  onBack: () => void;
  onRefresh: () => void;
}

// Configuration du Pet Codex
const PET_CONFIG_KEY = "agent-pet:config";
const CONFIG_CHANGED_EVENT = "agent-pet:config-changed";

interface PetConfig {
  adopted: boolean;
  enabled: boolean;
  custom: {
    name: string;
    glyph: string;
    accent: string;
    greeting: string;
    imageUrl?: string;
    useCodexAtlas?: boolean;
    assignedAgent?: string;
  };
}

interface CodexPet {
  id: string;
  displayName: string;
  description: string;
  spritesheetUrl: string;
}

// Statut Watcher GitHub
type GithubStatus = {
  running: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunPrCount: number;
  lastRunError: string | null;
  nextRunAt: string | null;
};

export default function ModuleDetailConfig({ module, onBack, onRefresh }: ModuleDetailConfigProps) {
  const [installed, setInstalled] = useState(module.installed === 1);
  const [toggling, setToggling] = useState(false);

  // States pour les jetons GitHub & Vercel globaux
  const [githubToken, setGithubToken] = useState('');
  const [savingGithubToken, setSavingGithubToken] = useState(false);
  const [githubTokenSuccess, setGithubTokenSuccess] = useState(false);

  const [vercelToken, setVercelToken] = useState('');
  const [savingVercelToken, setSavingVercelToken] = useState(false);
  const [vercelTokenSuccess, setVercelTokenSuccess] = useState(false);

  // States pour Turso
  const [tursoUrl, setTursoUrl] = useState('');
  const [tursoToken, setTursoToken] = useState('');
  const [savingTurso, setSavingTurso] = useState(false);
  const [tursoSuccess, setTursoSuccess] = useState(false);
  const [tursoError, setTursoError] = useState<string | null>(null);

  // States pour les MCPs et configurations génériques
  const [payload, setPayload] = useState(module.payload || '{}');
  const [mcpUrl, setMcpUrl] = useState(module.mcpUrl || '');
  const [savingMcp, setSavingMcp] = useState(false);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const [mcpSuccess, setMcpSuccess] = useState(false);

  // States pour Pet Codex
  const [petConfig, setPetConfig] = useState<PetConfig | null>(null);
  const [petSaved, setPetSaved] = useState(false);
  const [codexPets, setCodexPets] = useState<CodexPet[]>([]);
  const [agents, setAgents] = useState<{ id: string; name: string }[]>([]);
  const [petSearch, setPetSearch] = useState('');

  // States pour GitHub Watcher
  const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubMessage, setGithubMessage] = useState('');

  // Initialisation des données spécifiques selon le module
  useEffect(() => {
    // Récupérer les configurations globales pour GitHub et Vercel
    if (module.identifier === 'module-github' || module.identifier === 'module-vercel') {
      fetch('/api/settings')
        .then((r) => r.json())
        .then((data) => {
          if (data.githubToken) setGithubToken(data.githubToken);
          if (data.vercelToken) setVercelToken(data.vercelToken);
        })
        .catch((e) => console.error("Failed to load settings", e));
    }

    // Charger les paramètres Turso depuis le payload
    if (module.identifier === 'module-turso') {
      try {
        const parsed = JSON.parse(module.payload || '{}');
        if (parsed.databaseUrl) setTursoUrl(parsed.databaseUrl);
        if (parsed.authToken) setTursoToken(parsed.authToken);
      } catch (e) {
        console.error("Failed to parse Turso payload", e);
      }
    }

    if (module.identifier === 'module-pet') {
      // Fetch Codex Pets
      fetch('/api/codex-pets?count=200')
        .then((r) => r.json())
        .then((data) => {
          if (data.pets) {
            const pets = data.pets
              .map((p: any) => ({
                id: String(p.id || ''),
                displayName: String(p.displayName || p.id || ''),
                description: p.description,
                spritesheetUrl: p.spritesheetUrl || `https://codex-pets.net/assets/pets/${p.id}/spritesheet.webp`,
              }))
              .filter((p: any) => p.id && p.spritesheetUrl);
            setCodexPets(pets);
          }
        })
        .catch((e) => console.error("Failed to fetch codex pets", e));

      // Fetch Agents
      fetch('/api/agents')
        .then((r) => r.json())
        .then((data) => {
          if (data.agents) setAgents(data.agents);
        })
        .catch((e) => console.error("Failed to fetch agents", e));

      // Charge config du localStorage
      const raw = localStorage.getItem(PET_CONFIG_KEY);
      if (raw) {
        try {
          setPetConfig(JSON.parse(raw));
        } catch (e) {
          console.error("Failed to parse pet config", e);
        }
      } else {
        setPetConfig({
          adopted: true,
          enabled: true,
          custom: {
            name: "Clawd",
            glyph: "🦀",
            accent: "#175B37",
            greeting: "Salut ! Je suis Clawd, ton assistant.",
            assignedAgent: "",
            imageUrl: "https://codex-pets.net/assets/pets/clawd/spritesheet.webp",
            useCodexAtlas: true,
          },
        });
      }
    }

    if (module.identifier === 'module-github' && installed) {
      const fetchGithubStatus = async () => {
        try {
          const res = await fetch('/api/agents/github/status');
          const data = await res.json();
          setGithubStatus(data.status);
        } catch {
          /* ignore */
        }
      };

      fetchGithubStatus();
      const intervalId = setInterval(fetchGithubStatus, 15000);
      return () => clearInterval(intervalId);
    }
  }, [module.identifier, installed]);

  const toggleInstall = async () => {
    setToggling(true);
    const nextState = !installed;
    try {
      const res = await fetch('/api/modules/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: module.id, installed: nextState }),
      });
      if (!res.ok) throw new Error('Erreur lors de la modification de l\'état');
      setInstalled(nextState);
      onRefresh();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setToggling(false);
    }
  };

  // Enregistrement du Token GitHub
  const handleSaveGithubToken = async (e: Event) => {
    e.preventDefault();
    setSavingGithubToken(true);
    setGithubTokenSuccess(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ githubToken: githubToken.trim() }),
      });
      if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
      setGithubTokenSuccess(true);
      setTimeout(() => setGithubTokenSuccess(false), 3000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingGithubToken(false);
    }
  };

  // Enregistrement du Token Vercel
  const handleSaveVercelToken = async (e: Event) => {
    e.preventDefault();
    setSavingVercelToken(true);
    setVercelTokenSuccess(false);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vercelToken: vercelToken.trim() }),
      });
      if (!res.ok) throw new Error('Erreur lors de la sauvegarde');
      setVercelTokenSuccess(true);
      setTimeout(() => setVercelTokenSuccess(false), 3000);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingVercelToken(false);
    }
  };

  // Enregistrement de la configuration Turso
  const handleSaveTurso = async (e: Event) => {
    e.preventDefault();
    setSavingTurso(true);
    setTursoError(null);
    setTursoSuccess(false);
    try {
      const tursoPayload = JSON.stringify({
        databaseUrl: tursoUrl.trim(),
        authToken: tursoToken.trim(),
      });
      const res = await fetch('/api/modules/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: module.id,
          payload: tursoPayload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la mise à jour');
      setTursoSuccess(true);
      setTimeout(() => setTursoSuccess(false), 3000);
      onRefresh();
    } catch (e: any) {
      setTursoError(e.message);
    } finally {
      setSavingTurso(false);
    }
  };

  // Enregistrement des configurations MCP Custom
  const handleSaveMcp = async (e: Event) => {
    e.preventDefault();
    setSavingMcp(true);
    setMcpError(null);
    setMcpSuccess(false);
    try {
      const res = await fetch('/api/modules/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: module.id,
          mcpUrl: mcpUrl.trim(),
          payload: payload.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la mise à jour');
      setMcpSuccess(true);
      setTimeout(() => setMcpSuccess(false), 3000);
      onRefresh();
    } catch (e: any) {
      setMcpError(e.message);
    } finally {
      setSavingMcp(false);
    }
  };

  // Enregistrement config Pet
  const handleSavePet = () => {
    if (!petConfig) return;
    localStorage.setItem(PET_CONFIG_KEY, JSON.stringify(petConfig));
    window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT));
    setPetSaved(true);
    setTimeout(() => setPetSaved(false), 2000);
  };

  const handleResetPet = () => {
    if (!window.confirm("Réinitialiser les paramètres de l'animal ?")) return;
    localStorage.removeItem(PET_CONFIG_KEY);
    window.location.reload();
  };

  const handlePetSelect = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    const petId = target.value;
    if (!petConfig) return;
    if (!petId) {
      setPetConfig({
        ...petConfig,
        custom: { ...petConfig.custom, imageUrl: undefined, useCodexAtlas: false },
      });
      return;
    }
    const pet = codexPets.find((p) => p.id === petId);
    if (pet) {
      setPetConfig({
        ...petConfig,
        custom: {
          ...petConfig.custom,
          name: pet.displayName,
          imageUrl: pet.spritesheetUrl,
          useCodexAtlas: true,
        },
      });
    }
  };

  // Scan GitHub Watcher
  const runGithubNow = async () => {
    setGithubBusy(true);
    setGithubMessage('');
    try {
      const res = await fetch('/api/agents/github/run-now', { method: 'POST' });
      const data = await res.json();
      setGithubMessage(
        data.ok
          ? `Scan terminé avec succès (${data.prCount} PRs analysées).`
          : `Échec : ${data.error || 'Erreur inconnue'}`
      );
      // Rafraîchir statut
      const resStatus = await fetch('/api/agents/github/status');
      const dataStatus = await resStatus.json();
      setGithubStatus(dataStatus.status);
    } catch (e: any) {
      setGithubMessage(`Erreur réseau : ${e.message}`);
    } finally {
      setGithubBusy(false);
      setTimeout(() => setGithubMessage(''), 5000);
    }
  };

  const isGithubRunningNow =
    githubStatus &&
    githubStatus.lastRunAt &&
    Date.now() - new Date(githubStatus.lastRunAt).getTime() < 60_000;

  const filteredPets = codexPets.filter((p) =>
    p.displayName.toLowerCase().includes(petSearch.toLowerCase()) ||
    p.id.toLowerCase().includes(petSearch.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 space-y-6 text-gray-800 text-left">
      {/* Bouton retour et titre */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-5">
        <div className="space-y-1">
          <button
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-gray-900 transition-colors"
          >
            ← Retour au catalogue
          </button>
          <div className="flex items-center gap-3 pt-1">
            <h2 className="text-xl font-bold text-gray-900">{module.name}</h2>
            {module.isMcp === 1 && (
              <span className="px-2 py-0.5 text-[9px] uppercase font-bold tracking-wider rounded bg-purple-50 text-purple-700 border border-purple-200">
                MCP
              </span>
            )}
            <span className="text-xs font-mono bg-gray-50 border border-gray-200 px-2 py-0.5 rounded text-gray-500">
              v{module.version}
            </span>
          </div>
        </div>

        {/* Bouton installer / désinstaller */}
        <button
          onClick={toggleInstall}
          disabled={toggling}
          className={`px-5 py-2.5 text-xs font-bold rounded-xl transition-all shadow-md disabled:opacity-50 ${
            installed
              ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
              : 'bg-[#175B37] text-white hover:bg-[#124a2c]'
          }`}
        >
          {toggling ? 'Mise à jour...' : installed ? 'Désinstaller le module' : 'Installer le module'}
        </button>
      </div>

      <p className="text-sm text-gray-600 leading-relaxed max-w-3xl">
        {module.description || "Aucune description fournie."}
      </p>

      {/* Si le module est désinstallé */}
      {!installed && (
        <div className="bg-amber-50/50 border border-amber-100 p-5 rounded-2xl flex gap-3.5 max-w-3xl">
          <span className="text-xl">⚠️</span>
          <div className="space-y-1">
            <h4 className="text-sm font-bold text-amber-900">Module non activé</h4>
            <p className="text-xs text-amber-700 leading-relaxed">
              Installez ce module pour activer ses outils, ses dashboards spécifiques ou configurer ses fonctionnalités.
            </p>
          </div>
        </div>
      )}

      {/* Si installé, afficher la configuration spécifique */}
      {installed && (
        <div className="space-y-6 pt-2">
          {/* CONFIGURATION DÉDIÉE : AGENT PET */}
          {module.identifier === 'module-pet' && petConfig && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Formulaire Pet */}
              <div className="space-y-5">
                <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">Paramètres de l'animal</h3>

                {/* Switch Activé / Désactivé dans le localstorage */}
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide text-gray-400 mb-0.5">Affichage du compagnon</h4>
                    <span className="text-sm font-bold text-gray-700">{petConfig.enabled ? 'Affiché' : 'Masqué'}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPetConfig({ ...petConfig, enabled: !petConfig.enabled })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                      petConfig.enabled ? 'bg-[#175B37]' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${petConfig.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Rechercher un animal (Codex)</label>
                  <input
                    type="text"
                    placeholder="Filtrer les animaux..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:border-[#175B37] outline-none transition-all"
                    value={petSearch}
                    onInput={(e) => setPetSearch((e.target as HTMLInputElement).value)}
                  />
                  <select
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#175B37] outline-none transition-all"
                    onChange={handlePetSelect}
                  >
                    <option value="">Conserver l'animal actuel</option>
                    {filteredPets.map((pet) => (
                      <option key={pet.id} value={pet.id} selected={petConfig.custom.imageUrl?.includes(pet.id)}>
                        {pet.displayName}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Nom de l'animal</label>
                  <input
                    type="text"
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#175B37] outline-none"
                    value={petConfig.custom.name}
                    onInput={(e) =>
                      setPetConfig({
                        ...petConfig,
                        custom: { ...petConfig.custom, name: (e.target as HTMLInputElement).value },
                      })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Agent assigné</label>
                  <select
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:border-[#175B37] outline-none"
                    onChange={(e) =>
                      setPetConfig({
                        ...petConfig,
                        custom: { ...petConfig.custom, assignedAgent: (e.target as HTMLSelectElement).value },
                      })
                    }
                  >
                    <option value="">Aucun agent assigné</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id} selected={petConfig.custom.assignedAgent === agent.id}>
                        {agent.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-500">L'animal réagira en direct aux tâches lancées par cet agent.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Message d'accueil</label>
                  <textarea
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:border-[#175B37] outline-none min-h-[70px]"
                    value={petConfig.custom.greeting}
                    onInput={(e) =>
                      setPetConfig({
                        ...petConfig,
                        custom: { ...petConfig.custom, greeting: (e.target as HTMLTextAreaElement).value },
                      })
                    }
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Couleur d'accent</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      className="h-10 w-20 cursor-pointer rounded-lg border border-gray-200"
                      value={petConfig.custom.accent}
                      onInput={(e) =>
                        setPetConfig({
                          ...petConfig,
                          custom: { ...petConfig.custom, accent: (e.target as HTMLInputElement).value },
                        })
                      }
                    />
                    <span className="font-mono text-xs text-gray-500">{petConfig.custom.accent.toUpperCase()}</span>
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleSavePet}
                    className="flex-1 bg-[#175B37] hover:bg-[#124a2c] text-white font-bold py-2.5 px-4 rounded-xl transition-all shadow text-xs flex items-center justify-center gap-1.5"
                  >
                    {petSaved ? 'Enregistré !' : 'Enregistrer'}
                  </button>
                  <button
                    onClick={handleResetPet}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-600 px-4 py-2.5 rounded-xl transition-all text-xs"
                  >
                    Réinitialiser
                  </button>
                </div>
              </div>

              {/* Prévisualisation Pet */}
              <div className="flex flex-col gap-4">
                <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">Rendu de l'animal</h3>
                <div className="flex-1 min-h-[250px] bg-gray-50 border border-dashed border-gray-200 rounded-3xl flex flex-col items-center justify-center p-6 relative overflow-hidden">
                  <div
                    className="absolute inset-0 opacity-[0.04]"
                    style={{ backgroundColor: petConfig.custom.accent }}
                  />
                  <div className="relative z-10 flex flex-col items-center gap-4 text-center">
                    {petConfig.custom.imageUrl ? (
                      <div
                        className="w-24 h-24"
                        style={{
                          backgroundImage: `url(${petConfig.custom.imageUrl})`,
                          backgroundSize: '800% 900%',
                          backgroundPosition: '0% 0%',
                          imageRendering: 'pixelated',
                        }}
                      />
                    ) : (
                      <div
                        className="w-20 h-20 rounded-full flex items-center justify-center text-4xl shadow border-2"
                        style={{
                          borderColor: petConfig.custom.accent,
                          backgroundColor: `${petConfig.custom.accent}10`,
                          color: petConfig.custom.accent,
                        }}
                      >
                        {petConfig.custom.glyph}
                      </div>
                    )}
                    <h4 className="text-lg font-black uppercase tracking-wider" style={{ color: petConfig.custom.accent }}>
                      {petConfig.custom.name}
                    </h4>
                    <div className="bg-white shadow rounded-xl p-3 text-xs italic max-w-[200px] border border-gray-100">
                      "{petConfig.custom.greeting}"
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* CONFIGURATION DÉDIÉE : WATCHER GITHUB */}
          {module.identifier === 'module-github' && (
            <div className="space-y-6 max-w-4xl">
              {/* Formulaire Token GitHub */}
              <form onSubmit={handleSaveGithubToken} className="space-y-3 bg-gray-50 border border-gray-200 rounded-2xl p-5 max-w-xl">
                <div>
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">Jeton d'accès GitHub (Token)</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">Le token est utilisé pour le watcher et les outils d'API GitHub des agents.</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="ghp_xxxxxxxxxxxx"
                    className="flex-1 bg-white border border-gray-250 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-[#175B37] outline-none"
                    value={githubToken}
                    onInput={(e) => setGithubToken((e.target as HTMLInputElement).value)}
                  />
                  <button
                    type="submit"
                    disabled={savingGithubToken}
                    className="bg-[#175B37] hover:bg-[#124a2c] text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shrink-0"
                  >
                    {savingGithubToken ? 'Enregistrement...' : githubTokenSuccess ? 'Enregistré !' : 'Sauvegarder'}
                  </button>
                </div>
              </form>

              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-gray-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900">Supervision du Watcher GitHub</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Le démon de surveillance scrute les pull requests et issues ouvertes de vos projets.</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={runGithubNow}
                    disabled={githubBusy}
                    className="bg-[#175B37] hover:bg-[#124a2c] text-white px-4 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                  >
                    {githubBusy ? 'Analyse...' : 'Scanner maintenant'}
                  </button>
                  <a
                    href="/agents/github"
                    className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center"
                  >
                    Ouvrir le tableau de bord →
                  </a>
                </div>
              </div>

              {githubMessage && (
                <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-800 rounded-xl text-xs">
                  {githubMessage}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block mb-1">Démon de veille</span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      githubStatus?.running
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : isGithubRunningNow
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-gray-50 text-gray-600 border border-gray-200'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${githubStatus?.running ? 'bg-blue-500 animate-pulse' : 'bg-gray-400'}`} />
                    {githubStatus?.running ? 'Actif' : isGithubRunningNow ? 'Veille OK' : 'Inactif'}
                  </span>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block mb-1">Fréquence</span>
                  <span className="text-xl font-bold text-gray-800">{githubStatus?.intervalMinutes ?? '—'} min</span>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block mb-1">Analyse récente</span>
                  <span className="text-xl font-bold text-gray-800">{githubStatus?.lastRunPrCount ?? 0} PR(s)</span>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-gray-400 block mb-1">Prochain scan</span>
                  <span className="text-sm font-bold text-gray-700 block mt-1">
                    {githubStatus?.nextRunAt ? new Date(githubStatus.nextRunAt).toLocaleTimeString() : 'Non planifié'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* CONFIGURATION DÉDIÉE : VERCEL */}
          {module.identifier === 'module-vercel' && (
            <div className="space-y-6 max-w-4xl">
              {/* Formulaire Token Vercel */}
              <form onSubmit={handleSaveVercelToken} className="space-y-3 bg-gray-50 border border-gray-200 rounded-2xl p-5 max-w-xl">
                <div>
                  <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">Jeton d'accès Vercel (API Token)</h4>
                  <p className="text-[10px] text-gray-500 mt-0.5">Le token est utilisé pour le suivi et le déclenchement automatique des déploiements.</p>
                </div>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder="Configuration secrète masquée"
                    className="flex-1 bg-white border border-gray-255 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-[#175B37] outline-none"
                    value={vercelToken}
                    onInput={(e) => setVercelToken((e.target as HTMLInputElement).value)}
                  />
                  <button
                    type="submit"
                    disabled={savingVercelToken}
                    className="bg-[#175B37] hover:bg-[#124a2c] text-white px-4 py-2.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50 shrink-0"
                  >
                    {savingVercelToken ? 'Enregistrement...' : vercelTokenSuccess ? 'Enregistré !' : 'Sauvegarder'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* CONFIGURATION DÉDIÉE : TURSO */}
          {module.identifier === 'module-turso' && (
            <div className="space-y-6 max-w-4xl">
              <form onSubmit={handleSaveTurso} className="space-y-4 bg-gray-50 border border-gray-200 rounded-2xl p-5 max-w-xl">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Configuration de la base de données Turso</h4>
                  <p className="text-xs text-gray-500 mt-0.5">Saisissez l'URL et le jeton d'authentification pour permettre à vos agents de piloter vos bases Turso.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide">URL de la base (TURSO_DATABASE_URL)</label>
                  <input
                    type="url"
                    placeholder="libsql://ma-base-user.turso.io"
                    className="w-full bg-white border border-gray-250 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-[#175B37] outline-none"
                    value={tursoUrl}
                    onInput={(e) => setTursoUrl((e.target as HTMLInputElement).value)}
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wide">Jeton d'autorisation (TURSO_AUTH_TOKEN)</label>
                  <input
                    type="password"
                    placeholder="eyJhbGciOiJ..."
                    className="w-full bg-white border border-gray-250 rounded-xl px-4 py-2.5 text-xs font-mono focus:border-[#175B37] outline-none"
                    value={tursoToken}
                    onInput={(e) => setTursoToken((e.target as HTMLInputElement).value)}
                    required
                  />
                </div>

                {tursoError && (
                  <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 p-3 rounded-xl">
                    {tursoError}
                  </div>
                )}

                {tursoSuccess && (
                  <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                    Configuration Turso sauvegardée avec succès !
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingTurso}
                  className="bg-[#175B37] hover:bg-[#124a2c] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50"
                >
                  {savingTurso ? 'Sauvegarde...' : 'Enregistrer la configuration Turso'}
                </button>
              </form>
            </div>
          )}

          {/* CONFIGURATION DÉDIÉE : DOCKER / ZIMAOS */}
          {module.identifier === 'module-docker' && (
            <div className="space-y-4 max-w-3xl">
              <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">Outils système Docker</h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                L'activation de ce module permet à vos agents d'exécuter des diagnostics système et de gérer les conteneurs (via le socket Unix local ou l'API de ZimaOS).
              </p>
              <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 space-y-2">
                <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wide">Outils mis à disposition des agents :</h4>
                <div className="flex flex-wrap gap-2 pt-1">
                  {['docker_ps', 'docker_logs', 'docker_container_create', 'docker_container_stop', 'docker_container_start', 'docker_container_restart', 'docker_compose_up', 'docker_compose_down', 'docker_volume_list'].map((t) => (
                    <span key={t} className="text-xs font-mono bg-white border border-gray-250 px-2.5 py-1 rounded-lg text-gray-700 shadow-sm">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CONFIGURATION MCP / CUSTOM */}
          {module.identifier !== 'module-pet' && 
           module.identifier !== 'module-github' && 
           module.identifier !== 'module-docker' && 
           module.identifier !== 'module-vercel' &&
           module.identifier !== 'module-turso' && (
            <form onSubmit={handleSaveMcp} className="space-y-5 max-w-xl">
              <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">Configuration de l'extension</h3>

              <div className="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-xl">
                <div>
                  <label className="block text-xs font-bold text-gray-800">Serveur MCP</label>
                  <span className="text-[10px] text-gray-500">Utilise le Model Context Protocol</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${module.isMcp === 1 ? 'bg-purple-50 text-purple-700 border border-purple-200' : 'bg-gray-100 text-gray-500'}`}>
                  {module.isMcp === 1 ? 'Actif' : 'Inactif'}
                </span>
              </div>

              {module.isMcp === 1 && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">URL du serveur MCP</label>
                  <input
                    type="url"
                    placeholder="http://host.docker.internal:3000/sse"
                    value={mcpUrl}
                    onInput={(e) => setMcpUrl((e.target as HTMLInputElement).value)}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:border-[#175B37] outline-none font-mono"
                    required={module.isMcp === 1}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400">Configuration Payload (JSON)</label>
                <textarea
                  placeholder="{}"
                  value={payload}
                  onInput={(e) => setPayload((e.target as HTMLTextAreaElement).value)}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-xs focus:border-[#175B37] outline-none font-mono min-h-[100px]"
                />
              </div>

              {mcpError && (
                <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 p-3 rounded-xl">
                  {mcpError}
                </div>
              )}

              {mcpSuccess && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 p-3 rounded-xl">
                  Configuration mise à jour avec succès !
                </div>
              )}

              <button
                type="submit"
                disabled={savingMcp}
                className="bg-[#175B37] hover:bg-[#124a2c] text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md disabled:opacity-50"
              >
                {savingMcp ? 'Enregistrement...' : 'Enregistrer la configuration'}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
