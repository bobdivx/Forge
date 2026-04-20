import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type Config = {
  forgePublicUrl: string;
  openclawContainerName: string;
  openclawGatewayUrl: string;
  openclawToken: string;
  ollamaUrl: string;
  forgeReposRoot: string;
  forgeReposRootAgent: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
  [k: string]: string;
};

type OpenClawMount = { source: string; destination: string; type: string; mode: string };

type OpenClawProbe = {
  attempted?: boolean;
  skipReason?: string;
  dockerError?: string;
  containerName?: string | null;
  mounts?: OpenClawMount[];
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
  openclawNote?: string;
  openclawProbe?: OpenClawProbe;
  openclawBindSuggestions?: BindSuggestion[];
};

type Props = {
  settings: Config;
  setSettings: (c: Config) => void;
  onSave: () => void;
  saving: boolean;
  message: string;
  reposHealth?: ReposHealth | null;
  onRefreshHealth?: () => void;
};

const inputCls =
  'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition font-mono';

function SectionTitle({ n, title, subtitle }: { n: string; title: string; subtitle?: string }) {
  return (
    <div class="border-b border-gray-100 pb-4 mb-6">
      <p class="text-[10px] font-bold text-[#175B37] uppercase tracking-widest mb-1">{n}</p>
      <h2 class="text-lg font-bold text-gray-900">{title}</h2>
      {subtitle && <p class="text-xs text-gray-500 mt-1.5 max-w-3xl">{subtitle}</p>}
    </div>
  );
}

export default function IntegrationTab({
  settings,
  setSettings,
  onSave,
  saving,
  message,
  reposHealth,
  onRefreshHealth,
}: Props) {
  const st = reposHealth?.status ?? '';
  const healthyRepos = st === 'ok';
  const probe = reposHealth?.openclawProbe;
  const bindMounts = (probe?.mounts ?? []).filter((m) => m.type === 'bind' && m.destination);
  const suggestions: BindSuggestion[] = Array.isArray(reposHealth?.openclawBindSuggestions)
    ? (reposHealth.openclawBindSuggestions as BindSuggestion[])
    : [];
  const datalistId = 'forge-repos-root-suggestions';

  return (
    <div class="p-6 space-y-10">
      <p class="text-xs text-gray-500 -mt-1">
        Tout ce qui lie <strong>Forge</strong> (ce serveur) à <strong>OpenClaw</strong> (agents) et au <strong>disque</strong>{' '}
        des dépôts Git. Une seule sauvegarde en bas de page.
      </p>

      {/* ── OpenClaw / réseau ───────────────────────────────────────────── */}
      <section>
        <SectionTitle
          n="Étape 1"
          title="OpenClaw — gateway & conteneur"
          subtitle="Les URLs sont résolues par le serveur Forge, pas par votre navigateur. En production sur un NAS, utilisez l’IP LAN ou un nom d’hôte joignable depuis le processus Astro."
        />
        <div class="space-y-4 max-w-3xl">
          <FormField
            label="Nom du conteneur OpenClaw (Docker)"
            hint="Vide = auto (docker ps, nom contenant « openclaw »). Sert à lister les volumes et à vérifier que le répertoire des apps existe dans le conteneur."
          >
            <input
              type="text"
              placeholder="openclaw"
              value={settings.openclawContainerName}
              onInput={(e) =>
                setSettings({ ...settings, openclawContainerName: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
          <FormField
            label="URL Forge joignable par les agents (hooks)"
            hint="Vue depuis OpenClaw (ex. http://forge-host:4321). Vide = variables d’environnement / localhost."
          >
            <input
              type="url"
              placeholder="http://forge-host:4321"
              value={settings.forgePublicUrl}
              onInput={(e) =>
                setSettings({ ...settings, forgePublicUrl: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
          <FormField label="URL du gateway OpenClaw" hint="Où écoute la passerelle (souvent port publié CasaOS, ex. 24190).">
            <input
              type="url"
              placeholder="http://127.0.0.1:24190"
              value={settings.openclawGatewayUrl}
              onInput={(e) =>
                setSettings({ ...settings, openclawGatewayUrl: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
          <FormField label="Token d’accès (gateway token)">
            <input
              type="password"
              placeholder="Token openclaw.json / gateway"
              value={settings.openclawToken}
              onInput={(e) =>
                setSettings({ ...settings, openclawToken: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
          <FormField
            label="URL API Ollama"
            hint="GET /api/tags (ex. http://host.docker.internal:11434). Utilisée par les sondes modèles / audit."
          >
            <input
              type="url"
              placeholder="http://127.0.0.1:11434"
              value={settings.ollamaUrl}
              onInput={(e) =>
                setSettings({ ...settings, ollamaUrl: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
        </div>
      </section>

      {/* ── Santé + chemins ─────────────────────────────────────────────── */}
      <section>
        <SectionTitle
          n="Étape 2"
          title="Disque — applications & Docker"
          subtitle="Le répertoire des applications doit être le même chemin absolu que les agents voient dans OpenClaw (bind mount identique hôte → conteneur, ex. /media/GitHub:/media/GitHub)."
        />
        <p class="text-[11px] text-gray-500 max-w-3xl mb-4 leading-relaxed">
          Forge et OpenClaw sont bien <strong>deux conteneurs différents</strong>, mais ils tournent en général sous le{' '}
          <strong>même moteur Docker</strong> sur le NAS : le démon sur l’hôte connaît <em>tous</em> les conteneurs. Quand
          le conteneur Forge exécute <code class="font-mono text-gray-600">docker inspect openclaw</code>, c’est via le
          socket <code class="font-mono text-gray-600">/var/run/docker.sock</code> (ou équivalent) vers cet hôte — ce
          n’est pas Forge qui « entre » dans le conteneur OpenClaw par le réseau applicatif. Sur Vercel / sans accès au
          démon Docker, la sonde échoue : saisie manuelle ou{' '}
          <code class="font-mono text-gray-600">FORGE_DISABLE_OPENCLAW_PATH_PROBE=1</code>.
        </p>

        {reposHealth && (
          <div
            class={`text-xs rounded-xl px-4 py-3 mb-6 space-y-2 border ${
              healthyRepos
                ? 'bg-emerald-50/90 border-emerald-100 text-emerald-900'
                : 'bg-amber-50/90 border-amber-100 text-amber-950'
            }`}
            role="status"
          >
            <div class="flex items-start justify-between gap-2 flex-wrap">
              <p class="font-semibold">
                Vérification Forge + conteneur{' '}
                <span class="font-normal opacity-80">{reposHealth.path ? `→ ${reposHealth.path}` : ''}</span>
              </p>
              {onRefreshHealth && (
                <button
                  type="button"
                  onClick={() => onRefreshHealth()}
                  class="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-lg border border-current/20 hover:opacity-80"
                >
                  Actualiser
                </button>
              )}
            </div>
            <p>{reposHealth.summary}</p>
            {typeof reposHealth.gitReposFound === 'number' && (
              <p class="font-mono text-[11px] opacity-90">Dépôts Git (racine) : {reposHealth.gitReposFound}</p>
            )}
            {reposHealth.openclawNote && (
              <p class="text-[11px] opacity-90 border-t border-current/10 pt-2 mt-2">{reposHealth.openclawNote}</p>
            )}
            {probe?.attempted && (
              <div class="border-t border-current/10 pt-3 mt-2 space-y-2">
                <p class="font-semibold">
                  OpenClaw (Docker){' '}
                  {probe.containerName ? <span class="font-mono font-normal">· {probe.containerName}</span> : null}
                </p>
                {probe.dockerError && (
                  <p class="text-[11px] text-red-700 bg-red-50/80 rounded px-2 py-1">{probe.dockerError}</p>
                )}
                {probe.skipReason && !probe.dockerError && (
                  <p class="text-[11px] opacity-90">{probe.skipReason}</p>
                )}
                {probe.pathTested && (
                  <p class="text-[11px] font-mono break-all">
                    Test <code class="text-[10px]">test -d</code> dans le conteneur : <strong>{probe.pathTested}</strong> →{' '}
                    {probe.pathExistsInContainer ? (
                      <span class="text-emerald-700">présent</span>
                    ) : (
                      <span class="text-red-700">absent</span>
                    )}
                    {probe.likelyMountMatch ? ' · bind couvrant ce chemin' : ''}
                  </p>
                )}
                {bindMounts.length > 0 && (
                  <details class="text-[11px]">
                    <summary class="cursor-pointer font-medium opacity-90">
                      Volumes bind ({bindMounts.length}) — chemins dans le conteneur
                    </summary>
                    <ul class="mt-2 space-y-1 font-mono max-h-40 overflow-y-auto pl-3 list-disc">
                      {bindMounts.slice(0, 24).map((m) => (
                        <li key={m.destination}>
                          <span class="text-emerald-800">{m.destination}</span>
                          <span class="opacity-60"> ← </span>
                          <span class="break-all">{m.source}</span>
                        </li>
                      ))}
                      {bindMounts.length > 24 && <li>… {bindMounts.length - 24} autre(s)</li>}
                    </ul>
                  </details>
                )}
                {!probe.pathExistsInContainer && probe.attempted && probe.containerName && (
                  <p class="text-[11px]">
                    Ajustez le compose OpenClaw ou le « Répertoire des applications » pour qu’il corresponde à une{' '}
                    <span class="font-mono">Destination</span> listée ci-dessus.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div class="space-y-4 max-w-3xl">
          <FormField
            label="Répertoire des applications"
            hint="Chemin sur la machine où tourne Forge (= hôte du bind, colonne Source). Un sous-dossier = une app. Cliquez une suggestion ci-dessous ou saisissez à la main après « Actualiser » si Docker est joignable."
          >
            <input
              type="text"
              list={suggestions.length ? datalistId : undefined}
              value={settings.forgeReposRoot}
              onInput={(e) =>
                setSettings({ ...settings, forgeReposRoot: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
            {suggestions.length > 0 && (
              <datalist id={datalistId}>
                {suggestions.map((s) => (
                  <option key={s.hostPath} value={s.hostPath}>
                    {`OpenClaw : ${s.containerPath}`}
                  </option>
                ))}
              </datalist>
            )}
          </FormField>
          {suggestions.length > 0 && (
            <div class="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
              <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                Dossiers montés (bind) — même chemin hôte que dans OpenClaw
              </p>
              <ul class="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                {suggestions.map((s) => (
                  <li key={`${s.hostPath}:${s.containerPath}`}>
                    <button
                      type="button"
                      onClick={() => setSettings({ ...settings, forgeReposRoot: s.hostPath })}
                      class={`w-full text-left text-xs font-mono rounded-lg px-3 py-2 border transition-colors ${
                        settings.forgeReposRoot.trim() === s.hostPath
                          ? 'border-[#175B37] bg-[#E9F3EB] text-[#0B2717]'
                          : 'border-gray-200 bg-white hover:border-gray-300 text-gray-800'
                      }`}
                    >
                      <span class="block text-[11px] text-gray-500 mb-0.5">Hôte (Forge) — à enregistrer</span>
                      <span class="text-emerald-900">{s.hostPath}</span>
                      <span class="block text-[10px] text-gray-500 mt-1">
                        dans OpenClaw : <span class="text-gray-700">{s.containerPath}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {probe?.attempted && suggestions.length === 0 && !probe.dockerError && (
            <p class="text-[11px] text-gray-500">
              Aucun bind mount listé (conteneur sans volumes typiques ou inspect incomplet). Saisie manuelle ou
              vérifiez le nom du conteneur.
            </p>
          )}
          <FormField
            label="Racine des projets vue par les agents (NAS)"
            hint="Chemin dans le conteneur / sur le NAS (ex. /mnt/GitHub). Utilisée pour traduire les chemins dans les instructions agents. Souvent le Destination du bind des apps."
          >
            <input
              type="text"
              value={settings.forgeReposRootAgent}
              onInput={(e) =>
                setSettings({ ...settings, forgeReposRootAgent: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
          <FormField label="Dossier Docker YAML" hint="Repère pour vos stacks sur le NAS.">
            <input
              type="text"
              value={settings.dockerYamlDir}
              onInput={(e) =>
                setSettings({ ...settings, dockerYamlDir: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
          <FormField label="Dossier AppData Docker">
            <input
              type="text"
              value={settings.dockerAppDataDir}
              onInput={(e) =>
                setSettings({ ...settings, dockerAppDataDir: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
        </div>
      </section>

      <SaveRow message={message} saving={saving} onSave={onSave} label="Sauvegarder l’intégration" />
    </div>
  );
}
