import { useState, useEffect } from 'preact/hooks';
import SaveRow from '../ui/SaveRow';
import FolderBrowseModal from './FolderBrowseModal';

type Config = {
  forgePublicUrl: string;
  zimaosContainerName: string;
  zimaosRuntimeUrl: string;
  ollamaUrl: string;
  forgeReposRoot: string;
  forgeReposRootAgent: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
  [k: string]: string;
};

type ZimaOSMount = { source: string; destination: string; type: string; mode: string };

type ZimaOSProbe = {
  attempted?: boolean;
  skipReason?: string;
  dockerError?: string;
  containerName?: string | null;
  mounts?: ZimaOSMount[];
  pathTested?: string;
  pathExistsInContainer?: boolean;
  likelyMountMatch?: boolean;
};

type BindSuggestion = { hostPath: string; containerPath: string };

type ReposHealth = {
  status?: string;
  summary?: string;
  path?: string;
  gitReposFound?: number;
  zimaosNote?: string;
  zimaosProbe?: ZimaOSProbe;
  zimaosBindSuggestions?: BindSuggestion[];
};

type Props = {
  settings: Config;
  setSettings: (c: Config) => void;
  onSave: () => void;
  saving: boolean;
  message: string;
};

const inputCls =
  'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 focus:bg-white focus:border-[#175B37] focus:ring-4 focus:ring-[#175B37]/10 outline-none transition-all font-mono shadow-inner';

function Card({ children, icon, title, description }: { children: any; icon: any; title: string; description: string }) {
  return (
    <div class="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm hover:shadow-md hover:border-gray-200 transition-all duration-300 relative overflow-hidden group">
      <div class="absolute -right-12 -top-12 w-32 h-32 bg-gray-50 rounded-full blur-3xl opacity-50 group-hover:bg-[#175B37]/5 transition-colors duration-500" />
      <div class="relative z-10 flex gap-4 mb-6">
        <div class="shrink-0 w-12 h-12 rounded-2xl bg-gray-50 border border-gray-100 flex items-center justify-center text-[#175B37] group-hover:bg-[#175B37]/10 group-hover:border-[#175B37]/20 transition-colors">
          {icon}
        </div>
        <div>
          <h3 class="text-lg font-bold text-gray-900">{title}</h3>
          <p class="text-xs text-gray-500 mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <div class="relative z-10 space-y-5">
        {children}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: any }) {
  return (
    <div class="space-y-1.5">
      <label class="block text-sm font-semibold text-gray-800">{label}</label>
      {children}
      {hint && <p class="text-[11px] text-gray-500 font-medium leading-tight">{hint}</p>}
    </div>
  );
}

const IconNetwork = () => (
  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
  </svg>
);

const IconFolder = () => (
  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
  </svg>
);

const IconDocker = () => (
  <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
    <path stroke-linecap="round" stroke-linejoin="round" d="M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" />
  </svg>
);

type BrowseField = 'forgeReposRoot' | 'dockerYamlDir' | 'dockerAppDataDir';

const BROWSE_TITLES: Record<BrowseField, string> = {
  forgeReposRoot: 'Choisir la racine des applications (hôte)',
  dockerYamlDir: 'Choisir le dossier des stacks (YAML)',
  dockerAppDataDir: 'Choisir le dossier AppData',
};

export default function IntegrationTab({
  settings,
  setSettings,
  onSave,
  saving,
  message,
}: Props) {
  const [reposHealth, setReposHealth] = useState<ReposHealth | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [browseField, setBrowseField] = useState<BrowseField | null>(null);

  const fetchHealth = async () => {
    setIsRefreshing(true);
    try {
      const r = await fetch('/api/forge-repos-health');
      const h = await r.json();
      setReposHealth(typeof h === 'object' && h ? h : null);
    } catch {
      setReposHealth(null);
    } finally {
      setTimeout(() => setIsRefreshing(false), 500);
    }
  };

  useEffect(() => {
    fetchHealth();
    const t = setInterval(fetchHealth, 15000);
    return () => clearInterval(t);
  }, []);

  const suggestions: BindSuggestion[] = Array.isArray(reposHealth?.zimaosBindSuggestions)
    ? (reposHealth.zimaosBindSuggestions as BindSuggestion[])
    : [];
  const datalistId = 'forge-repos-root-suggestions';

  return (
    <div class="p-6 space-y-6 bg-gray-50/30">
      
      {/* Header */}
      <div class="flex items-center justify-between mb-8">
        <div>
          <h2 class="text-2xl font-black text-gray-900 tracking-tight">Docker & Chemins</h2>
          <p class="text-sm text-gray-500 mt-1 max-w-2xl">
            Configuration physique des chemins et de l'intégration système. 
            Définissez comment Forge accède aux dépôts Git sur l'hôte et dans les conteneurs.
          </p>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div class="space-y-6">
          <Card 
            title="Connectivité Serveur" 
            description="Exposition de Forge pour permettre aux agents de communiquer via des webhooks."
            icon={<IconNetwork />}
          >
            <Field label="URL Forge (Vue par les agents)" hint="Ex: http://forge-host:4331 ou http://192.168.x.x:4331">
              <input
                type="url"
                placeholder="http://192.168.1.100:4331"
                value={settings.forgePublicUrl}
                onInput={(e) => setSettings({ ...settings, forgePublicUrl: (e.target as HTMLInputElement).value })}
                class={inputCls}
              />
            </Field>
          </Card>

          <Card 
            title="Configuration Docker" 
            description="Emplacements physiques des stacks et données d'application sur le NAS."
            icon={<IconDocker />}
          >
            <Field label="Dossier des stacks (Docker YAML)" hint="Chemin où se trouvent les fichiers docker-compose.yml">
              <div class="flex gap-2 items-stretch">
                <input
                  type="text"
                  value={settings.dockerYamlDir}
                  onInput={(e) => setSettings({ ...settings, dockerYamlDir: (e.target as HTMLInputElement).value })}
                  class={`${inputCls} flex-1 min-w-0`}
                />
                <button
                  type="button"
                  onClick={() => setBrowseField('dockerYamlDir')}
                  class="shrink-0 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 whitespace-nowrap"
                >
                  Parcourir…
                </button>
              </div>
            </Field>
            <Field label="Dossier AppData (Volumes)" hint="Chemin racine pour les données persistantes des conteneurs">
              <div class="flex gap-2 items-stretch">
                <input
                  type="text"
                  value={settings.dockerAppDataDir}
                  onInput={(e) => setSettings({ ...settings, dockerAppDataDir: (e.target as HTMLInputElement).value })}
                  class={`${inputCls} flex-1 min-w-0`}
                />
                <button
                  type="button"
                  onClick={() => setBrowseField('dockerAppDataDir')}
                  class="shrink-0 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 whitespace-nowrap"
                >
                  Parcourir…
                </button>
              </div>
            </Field>
          </Card>
        </div>

        <div class="space-y-6">
          <Card 
            title="Racine des Applications" 
            description="Le point de montage partagé (bind mount) contenant tous les dépôts Git."
            icon={<IconFolder />}
          >
            <Field label="Chemin Hôte (NAS / Machine Physique)" hint="Le dossier source (ex: /mnt/GitHub) vu par le moteur Docker.">
              <div class="flex gap-2 items-stretch">
                <input
                  type="text"
                  list={suggestions.length ? datalistId : undefined}
                  value={settings.forgeReposRoot}
                  onInput={(e) => setSettings({ ...settings, forgeReposRoot: (e.target as HTMLInputElement).value })}
                  class={`${inputCls} flex-1 min-w-0`}
                />
                <button
                  type="button"
                  onClick={() => setBrowseField('forgeReposRoot')}
                  class="shrink-0 text-xs font-semibold px-3 py-2 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 whitespace-nowrap"
                >
                  Parcourir…
                </button>
              </div>
              {suggestions.length > 0 && (
                <datalist id={datalistId}>
                  {suggestions.map((s) => (
                    <option key={s.hostPath} value={s.hostPath}>
                      {`ZimaOS : ${s.containerPath}`}
                    </option>
                  ))}
                </datalist>
              )}
            </Field>
            
            {suggestions.length > 0 && (
              <div class="bg-gray-50 rounded-2xl border border-gray-100 p-4">
                <div class="flex items-center justify-between mb-3">
                  <div class="flex items-center gap-2">
                    <span class={`flex w-2 h-2 rounded-full ${isRefreshing ? 'bg-emerald-400 animate-pulse' : 'bg-emerald-500'}`} />
                    <span class="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Montages détectés</span>
                  </div>
                  <button 
                    type="button" 
                    onClick={fetchHealth}
                    class={`p-1 rounded hover:bg-gray-200 transition-colors ${isRefreshing ? 'opacity-50 cursor-not-allowed' : ''}`}
                    disabled={isRefreshing}
                  >
                    <svg class={`w-3.5 h-3.5 text-gray-400 ${isRefreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                      <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <div class="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                  {suggestions.map((s) => (
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, forgeReposRoot: s.hostPath })}
                      class={`w-full flex flex-col items-start px-4 py-3 rounded-xl border transition-all ${
                        settings.forgeReposRoot.trim() === s.hostPath
                          ? 'bg-white border-[#175B37] shadow-sm ring-1 ring-[#175B37]/20'
                          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm text-gray-600'
                      }`}
                    >
                      <div class="flex items-center gap-2 w-full">
                        <span class="text-[10px] uppercase font-bold text-gray-400 w-12 text-left">Hôte</span>
                        <span class={`font-mono text-xs font-semibold truncate ${settings.forgeReposRoot.trim() === s.hostPath ? 'text-[#175B37]' : 'text-gray-900'}`}>
                          {s.hostPath}
                        </span>
                      </div>
                      <div class="flex items-center gap-2 w-full mt-1.5 pt-1.5 border-t border-gray-50">
                        <span class="text-[10px] uppercase font-bold text-gray-400 w-12 text-left">Agent</span>
                        <span class="font-mono text-[11px] truncate text-gray-500">
                          {s.containerPath}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div class="pt-2 space-y-2">
              <Field
                label="Chemin côté agent / conteneur (ZimaOS)"
                hint="Le bind mount vu depuis Linux dans le conteneur (ex. /mnt/GitHub). Forge traduit les chemins locaux vers cette racine pour les commandes agents. Souvent différent du chemin Windows de la racine hôte. Vide → défaut /mnt/GitHub."
              >
                <input
                  type="text"
                  placeholder="/mnt/GitHub"
                  value={settings.forgeReposRootAgent}
                  onInput={(e) => setSettings({ ...settings, forgeReposRootAgent: (e.target as HTMLInputElement).value })}
                  class={inputCls}
                />
              </Field>
              <p class="text-[11px] text-gray-500 leading-snug rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2">
                Pas de bouton « Parcourir » : il ouvre le disque où tourne Forge (ex. Windows), alors que ce champ décrit le chemin <span class="font-medium">dans le conteneur</span>. Reprenez la valeur « Agent » des montages détectés ci-dessus si besoin.
              </p>
            </div>
          </Card>
        </div>
      </div>

      <div class="pt-4">
        <SaveRow message={message} saving={saving} onSave={onSave} label="Sauvegarder l'intégration" />
      </div>

      <FolderBrowseModal
        open={browseField !== null}
        title={browseField ? BROWSE_TITLES[browseField] : ''}
        initialPath={browseField ? settings[browseField] : ''}
        onClose={() => setBrowseField(null)}
        onPick={(absPath) => {
          if (!browseField) return;
          setSettings({ ...settings, [browseField]: absPath });
          setBrowseField(null);
        }}
      />
    </div>
  );
}