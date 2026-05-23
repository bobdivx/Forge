import { useState, useEffect } from 'preact/hooks';

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

export default function PetTab() {
  const [config, setConfig] = useState<PetConfig | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [codexPets, setCodexPets] = useState<CodexPet[]>([]);
  const [agents, setAgents] = useState<{id: string, name: string}[]>([]);
  const [petSearch, setPetSearch] = useState('');

  useEffect(() => {
    // Fetch Codex Pets
    const fetchCodex = async () => {
      try {
        const r = await fetch('/api/codex-pets?count=200');
        const data = await r.json();
        
        if (data.pets) {
          // Normaliser pour correspondre à la structure CodexPet
          const pets = data.pets.map((p: any) => ({
            id: String(p.id || ''),
            displayName: String(p.displayName || p.id || ''),
            description: p.description,
            spritesheetUrl: p.spritesheetUrl || `https://codex-pets.net/assets/pets/${p.id}/spritesheet.webp`
          })).filter((p: any) => p.id && p.spritesheetUrl);
          
          setCodexPets(pets);
        }
      } catch (e) {
        console.error("Failed to fetch codex pets via proxy", e);
      }
    };
    fetchCodex();

    // Fetch Agents
    fetch('/api/agents')
      .then(r => r.json())
      .then(data => {
        if (data.agents) setAgents(data.agents);
      })
      .catch(e => console.error("Failed to fetch agents", e));

    const raw = localStorage.getItem(PET_CONFIG_KEY);
    if (raw) {
      try {
        setConfig(JSON.parse(raw));
      } catch (e) {
        console.error("Failed to parse pet config", e);
      }
    } else {
      setConfig({
        adopted: true,
        enabled: true,
        custom: {
          name: "Clawd",
          glyph: "🦀",
          accent: "#175B37",
          greeting: "Salut ! Je suis Clawd, ton assistant.",
          assignedAgent: "",
          imageUrl: "https://codex-pets.net/assets/pets/clawd/spritesheet.webp",
          useCodexAtlas: true
        },
      });
    }
  }, []);

  const handleSave = () => {
    if (!config) return;
    localStorage.setItem(PET_CONFIG_KEY, JSON.stringify(config));
    window.dispatchEvent(new CustomEvent(CONFIG_CHANGED_EVENT));
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleReset = () => {
    if (!window.confirm("Réinitialiser les paramètres de l'animal ?")) return;
    localStorage.removeItem(PET_CONFIG_KEY);
    window.location.reload();
  };

  const handlePetSelect = (e: Event) => {
    const target = e.target as HTMLSelectElement;
    const petId = target.value;
    if (!petId) {
      setConfig({
        ...config!,
        custom: { ...config!.custom, imageUrl: undefined, useCodexAtlas: false }
      });
      return;
    }
    const pet = codexPets.find(p => p.id === petId);
    if (pet) {
      setConfig({
        ...config!,
        custom: {
          ...config!.custom,
          name: pet.displayName,
          imageUrl: pet.spritesheetUrl,
          useCodexAtlas: true
        }
      });
    }
  };

  if (!config) return <div class="p-8 text-gray-400">Chargement...</div>;

  const filteredPets = codexPets.filter(p => 
    p.displayName.toLowerCase().includes(petSearch.toLowerCase()) || 
    p.id.toLowerCase().includes(petSearch.toLowerCase())
  );

  return (
    <div class="p-6 md:p-8 space-y-8">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Formulaire */}
        <div class="space-y-6">
          <div class="space-y-2">
            <h3 class="text-lg font-bold text-gray-900">Personnalisation</h3>
            <p class="text-sm text-gray-500">Configurez l'apparence et le comportement de votre animal.</p>
          </div>

          <div class="space-y-4">
            {/* Activation / Désactivation */}
            <div class="bg-gray-50 border border-gray-200 rounded-2xl p-4 flex items-center justify-between transition-all hover:bg-gray-100/50">
              <div class="space-y-0.5">
                <span class="text-xs font-semibold uppercase tracking-wider text-gray-400">Statut de l'animal</span>
                <h4 class="text-sm font-bold text-gray-800">
                  {config.enabled ? 'Animal activé' : 'Animal désactivé'}
                </h4>
                <p class="text-xs text-gray-500">
                  {config.enabled ? "L'animal est affiché sur toutes les pages." : "L'animal est masqué de l'interface."}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfig({ ...config, enabled: !config.enabled })}
                class={`relative inline-flex h-6.5 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-300 focus:outline-none focus:ring-4 focus:ring-[#175B37]/10 ${
                  config.enabled ? 'bg-[#175B37]' : 'bg-gray-200'
                }`}
              >
                <span
                  class={`pointer-events-none inline-block h-5.5 w-5.5 transform rounded-full bg-white shadow-md ring-0 transition duration-300 ease-in-out ${
                    config.enabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div class="space-y-1.5">
              <div class="flex justify-between items-center">
                <label class="text-xs font-semibold uppercase tracking-wider text-gray-400">Animal (Codex)</label>
                {codexPets.length > 0 && <span class="text-xs text-gray-400">{codexPets.length} disponibles</span>}
              </div>
              <input
                type="text"
                placeholder="Rechercher un animal..."
                class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-[#175B37]/20 focus:border-[#175B37] outline-none transition-all mb-2"
                value={petSearch}
                onInput={(e) => setPetSearch((e.target as HTMLInputElement).value)}
              />
              <select
                class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#175B37]/20 focus:border-[#175B37] outline-none transition-all"
                onChange={handlePetSelect}
                size={filteredPets.length > 0 ? Math.min(5, filteredPets.length + 1) : 1}
              >
                <option value="">Sélectionner un animal...</option>
                {filteredPets.map(pet => (
                  <option 
                    value={pet.id} 
                    selected={config.custom.imageUrl?.includes(pet.id)}
                  >
                    {pet.displayName}
                  </option>
                ))}
              </select>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-semibold uppercase tracking-wider text-gray-400">Agent assigné</label>
              <select
                class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#175B37]/20 focus:border-[#175B37] outline-none transition-all"
                onChange={(e) => setConfig({
                  ...config,
                  custom: { ...config.custom, assignedAgent: (e.target as HTMLSelectElement).value }
                })}
              >
                <option value="">Aucun agent assigné</option>
                {agents.map(agent => (
                  <option value={agent.id} selected={config.custom.assignedAgent === agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <p class="text-xs text-gray-500 mt-1">L'animal réagira aux actions de cet agent spécifique.</p>
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-semibold uppercase tracking-wider text-gray-400">Nom de l'animal</label>
              <input
                type="text"
                class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#175B37]/20 focus:border-[#175B37] outline-none transition-all"
                value={config.custom.name}
                onInput={(e) => setConfig({
                  ...config,
                  custom: { ...config.custom, name: (e.target as HTMLInputElement).value }
                })}
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-semibold uppercase tracking-wider text-gray-400">Message d'accueil</label>
              <textarea
                class="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-[#175B37]/20 focus:border-[#175B37] outline-none transition-all min-h-[100px]"
                value={config.custom.greeting}
                onInput={(e) => setConfig({
                  ...config,
                  custom: { ...config.custom, greeting: (e.target as HTMLTextAreaElement).value }
                })}
              />
            </div>

            <div class="space-y-1.5">
              <label class="text-xs font-semibold uppercase tracking-wider text-gray-400">Couleur d'accent</label>
              <div class="flex items-center gap-4">
                <input
                  type="color"
                  class="h-12 w-24 bg-transparent cursor-pointer rounded-lg overflow-hidden border border-gray-200"
                  value={config.custom.accent}
                  onInput={(e) => setConfig({
                    ...config,
                    custom: { ...config.custom, accent: (e.target as HTMLInputElement).value }
                  })}
                />
                <span class="font-mono text-sm text-gray-500">{config.custom.accent.toUpperCase()}</span>
              </div>
            </div>
          </div>

          <div class="flex gap-3 pt-4">
            <button
              onClick={handleSave}
              class="flex-1 bg-[#175B37] hover:bg-[#124a2c] text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
            >
              {isSaved ? (
                <>
                  <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  Enregistré
                </>
              ) : (
                'Enregistrer les modifications'
              )}
            </button>
            <button
              onClick={handleReset}
              class="bg-gray-50 hover:bg-gray-100 text-gray-400 hover:text-red-500 p-3 rounded-xl transition-all border border-gray-200"
              title="Réinitialiser"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Prévisualisation */}
        <div class="flex flex-col gap-6">
          <div class="space-y-2">
            <h3 class="text-lg font-bold text-gray-900">Prévisualisation</h3>
            <p class="text-sm text-gray-500">Aperçu du rendu final dans l'interface.</p>
          </div>

          <div class="flex-1 min-h-[300px] bg-gray-50 rounded-[2rem] border border-dashed border-gray-200 flex flex-col items-center justify-center p-8 relative overflow-hidden group">
            <div class="absolute inset-0 opacity-[0.05] pointer-events-none transition-all duration-500 group-hover:opacity-[0.08]" style={{ backgroundColor: config.custom.accent }} />
            
            <div class="relative z-10 flex flex-col items-center gap-6">
              {config.custom.imageUrl ? (
                 <div 
                  class="w-28 h-28 flex items-center justify-center transition-all duration-300 group-hover:scale-110"
                  style={{
                    backgroundImage: `url(${config.custom.imageUrl})`,
                    backgroundSize: '800% 900%',
                    backgroundPosition: '0% 0%',
                    imageRendering: 'pixelated'
                  }}
                 />
              ) : (
                <div 
                  class="w-28 h-28 rounded-full flex items-center justify-center text-5xl shadow-xl transition-all duration-300 group-hover:scale-110"
                  style={{ backgroundColor: `${config.custom.accent}15`, border: `3px solid ${config.custom.accent}`, color: config.custom.accent }}
                >
                  {config.custom.glyph}
                </div>
              )}

              <div class="text-center space-y-4">
                <h4 class="text-2xl font-black uppercase tracking-tighter" style={{ color: config.custom.accent }}>
                  {config.custom.name}
                  {config.custom.assignedAgent && (
                     <span class="block text-xs font-normal text-gray-500 tracking-normal mt-1 lowercase">
                       @{config.custom.assignedAgent}
                     </span>
                  )}
                </h4>
                
                <div class="relative max-w-[240px] bg-white shadow-lg rounded-2xl p-4 text-sm text-gray-700 italic border border-gray-100 animate-bounce-subtle">
                  "{config.custom.greeting}"
                  <div class="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rotate-45 bg-white border-t border-l border-gray-100" />
                </div>
              </div>
            </div>
          </div>
          
          <div class="bg-[#175B37]/5 border border-[#175B37]/10 rounded-2xl p-4 flex gap-3">
             <div class="bg-[#175B37]/20 p-2 rounded-lg h-fit text-[#175B37]">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
             </div>
             <p class="text-xs text-gray-600 leading-relaxed">
               Les modifications sont appliquées instantanément à toutes les instances de l'animal sur cette page et dans la barre latérale après l'enregistrement.
             </p>
          </div>
        </div>
      </div>
    </div>
  );
}
