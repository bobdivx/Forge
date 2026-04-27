import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';
import { useState } from 'preact/hooks';

type Config = {
  forgePublicUrl: string;
  zimaosContainerName: string;
  zimaosGatewayUrl: string;
  zimaosToken: string;
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
type ValueSource = 'env' | 'database' | 'fallback';
type NetworkMatrixPayload = {
  forge?: {
    resolvedBaseUrl?: string;
    source?: ValueSource;
    envValue?: string | null;
    dbValue?: string | null;
  };
  zimaosRuntime?: {
    resolvedBaseUrl?: string;
    source?: ValueSource | string;
    envValue?: string | null;
    dbValue?: string | null;
    candidates?: string[];
    tokenConfigured?: boolean;
    tokenSource?: string;
  };
  ollama?: {
    resolvedBaseUrl?: string | null;
    source?: ValueSource;
    envHost?: string | null;
    envOrigin?: string | null;
    dbValue?: string | null;
    endpointTags?: string | null;
  };
  probes?: {
    forgeLogin?: { ok?: boolean; status?: number; error?: string };
    zimaosHealth?: { ok?: boolean; status?: number; error?: string };
    ollamaTags?: { ok?: boolean; status?: number; error?: string };
  };
  timestamp?: string;
};

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
  const [networkMatrix, setNetworkMatrix] = useState<NetworkMatrixPayload | null>(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkError, setNetworkError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const loadNetworkMatrix = async () => {
    setNetworkLoading(true);
    setNetworkError('');
    try {
      const res = await fetch('/api/network-matrix');
      const data = (await res.json().catch(() => ({}))) as NetworkMatrixPayload;
      if (!res.ok) {
        setNetworkError('Diagnostic réseau indisponible.');
        setNetworkMatrix(null);
        return;
      }
      setNetworkMatrix(data);
    } catch {
      setNetworkError('Erreur réseau pendant le diagnostic.');
      setNetworkMatrix(null);
    } finally {
      setNetworkLoading(false);
    }
  };

  const sourceBadgeClass = (source?: string) => {
    if (source === 'env') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (source === 'database') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };
  const probeBadgeClass = (ok?: boolean) =>
    ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200';

  const copyNetworkMatrix = async () => {
    if (!networkMatrix) return;
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      setCopyMessage('Copie non disponible dans ce navigateur.');
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(networkMatrix, null, 2));
      setCopyMessage('Diagnostic copié dans le presse-papiers.');
    } catch {
      setCopyMessage('Échec de copie.');
    }
    setTimeout(() => setCopyMessage(''), 2200);
  };

  const st = reposHealth?.status ?? '';
  const healthyRepos = st === 'ok';
  const probe = reposHealth?.zimaosProbe;
  const bindMounts = (probe?.mounts ?? []).filter((m) => m.type === 'bind' && m.destination);
  const dockerUnavailable = Boolean(probe?.dockerError && /docker.*(enoent|inaccessible)/i.test(probe.dockerError));
  const suggestions: BindSuggestion[] = Array.isArray(reposHealth?.zimaosBindSuggestions)
    ? (reposHealth.zimaosBindSuggestions as BindSuggestion[])
    : [];
  const datalistId = 'forge-repos-root-suggestions';

  return (
    <div class="p-6 space-y-10">
      <p class="text-xs text-gray-500 -mt-1">
        Tout ce qui lie <strong>Forge</strong> (ce serveur) à <strong>ZimaOS</strong> (agents) et au <strong>disque</strong>{' '}
        des dépôts Git. Une seule sauvegarde en bas de page.
      </p>

      {/* ── ZimaOS / réseau ───────────────────────────────────────────── */}
      <section>
        <SectionTitle
          n="Étape 1"
          title="ZimaOS — gateway & conteneur"
          subtitle="Les URLs sont résolues par le serveur Forge, pas par votre navigateur. En production NAS/Docker, renseignez l’URL réellement joignable depuis le process Forge (interne conteneur ou port publié hôte selon votre architecture)."
        />
        <div class="space-y-4 max-w-3xl">
          <div class="rounded-xl border border-gray-200 bg-gray-50/70 p-3">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <p class="text-xs text-gray-600">
                Diagnostic live des URLs réellement résolues par le serveur Forge.
              </p>
              <button
                type="button"
                onClick={loadNetworkMatrix}
                class="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60"
                disabled={networkLoading}
              >
                {networkLoading ? 'Diagnostic…' : 'Diagnostic réseau'}
              </button>
            </div>
            {networkError && <p class="text-[11px] text-red-600 mt-2">{networkError}</p>}
            {networkMatrix && (
              <div class="mt-3 space-y-2 text-[11px]">
                {(networkMatrix.forge?.source === 'env' && networkMatrix.forge?.dbValue) ||
                (networkMatrix.zimaosRuntime?.source === 'env' && networkMatrix.zimaosRuntime?.dbValue) ? (
                  <p class="rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-2 py-1.5">
                    Une variable d’environnement écrase une valeur enregistrée en base. C’est normal, mais la valeur UI peut sembler ignorée tant que l’env est définie.
                  </p>
                ) : null}
                <div class="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div class="rounded-lg border border-gray-200 bg-white p-2">
                    <p class="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Forge</p>
                    <p class="font-mono break-all text-gray-800">{networkMatrix.forge?.resolvedBaseUrl || '—'}</p>
                    <span class={`inline-flex mt-1 px-2 py-0.5 rounded-full border ${sourceBadgeClass(networkMatrix.forge?.source)}`}>
                      source: {networkMatrix.forge?.source || '—'}
                    </span>
                  </div>
                  <div class="rounded-lg border border-gray-200 bg-white p-2">
                    <p class="text-[10px] uppercase tracking-wide text-gray-500 mb-1">ZimaOS</p>
                    <p class="font-mono break-all text-gray-800">{networkMatrix.zimaosRuntime?.resolvedBaseUrl || '—'}</p>
                    <span class={`inline-flex mt-1 px-2 py-0.5 rounded-full border ${sourceBadgeClass(networkMatrix.zimaosRuntime?.source)}`}>
                      source: {networkMatrix.zimaosRuntime?.source || '—'}
                    </span>
                  </div>
                  <div class="rounded-lg border border-gray-200 bg-white p-2">
                    <p class="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Ollama</p>
                    <p class="font-mono break-all text-gray-800">{networkMatrix.ollama?.resolvedBaseUrl || '—'}</p>
                    <span class={`inline-flex mt-1 px-2 py-0.5 rounded-full border ${sourceBadgeClass(networkMatrix.ollama?.source)}`}>
                      source: {networkMatrix.ollama?.source || '—'}
                    </span>
                  </div>
                </div>
                <div class="rounded-lg border border-gray-200 bg-white p-2">
                  <p class="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Probes serveur</p>
                  <div class="flex flex-wrap gap-2">
                    <span class={`inline-flex px-2 py-0.5 rounded-full border ${probeBadgeClass(networkMatrix.probes?.forgeLogin?.ok)}`}>
                      Forge /login: {networkMatrix.probes?.forgeLogin?.ok ? 'OK' : 'KO'} ({networkMatrix.probes?.forgeLogin?.status ?? 0})
                    </span>
                    <span class={`inline-flex px-2 py-0.5 rounded-full border ${probeBadgeClass(networkMatrix.probes?.zimaosHealth?.ok)}`}>
                      Runtime ZimaOS /health: {networkMatrix.probes?.zimaosHealth?.ok ? 'OK' : 'KO'} ({networkMatrix.probes?.zimaosHealth?.status ?? 0})
                    </span>
                    <span class={`inline-flex px-2 py-0.5 rounded-full border ${probeBadgeClass(networkMatrix.probes?.ollamaTags?.ok)}`}>
                      Ollama /api/tags: {networkMatrix.probes?.ollamaTags?.ok ? 'OK' : 'KO'} ({networkMatrix.probes?.ollamaTags?.status ?? 0})
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={copyNetworkMatrix}
                    class="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                  >
                    Copier diagnostic
                  </button>
                  {copyMessage && <p class="text-[11px] text-gray-600">{copyMessage}</p>}
                </div>
                <details class="rounded-lg border border-gray-200 bg-white p-2">
                  <summary class="cursor-pointer text-gray-700 font-medium">
                    Détails techniques (env/base/fallback)
                  </summary>
                  <pre class="mt-2 text-[10px] leading-relaxed whitespace-pre-wrap break-all text-gray-700">
                    {JSON.stringify(networkMatrix, null, 2)}
                  </pre>
                </details>
              </div>
            )}
          </div>

          <FormField
            label="Nom du conteneur ZimaOS (Docker)"
            hint="Vide = auto (docker ps, nom contenant « zimaos »). Sert à lister les volumes et à vérifier que le répertoire des apps existe dans le conteneur."
          >
            <input
              type="text"
              placeholder="zimaos"
              value={settings.zimaosContainerName}
              onInput={(e) =>
                setSettings({ ...settings, zimaosContainerName: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
          <FormField
            label="URL Forge joignable par les agents (hooks)"
            hint="Vue depuis ZimaOS/agents. Production Docker: http://forge-host:4331. Dev hôte: http://forge-host:4321. Exemple LAN: http://<ip-nas>:4331."
          >
            <input
              type="url"
              placeholder="http://forge-host:4331 ou http://192.168.x.x:4331"
              value={settings.forgePublicUrl}
              onInput={(e) =>
                setSettings({ ...settings, forgePublicUrl: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
          <FormField label="URL du gateway ZimaOS" hint="URL joignable depuis Forge. Production Docker: http://host.docker.internal:24190. Dev hôte: http://127.0.0.1:24190. En interne ZimaOS: 18789.">
            <input
              type="url"
              placeholder="http://host.docker.internal:24190"
              value={settings.zimaosGatewayUrl}
              onInput={(e) =>
                setSettings({ ...settings, zimaosGatewayUrl: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
          <FormField label="Token d’accès (gateway token)">
            <input
              type="password"
              placeholder="Token zimaos.json / gateway"
              value={settings.zimaosToken}
              onInput={(e) =>
                setSettings({ ...settings, zimaosToken: (e.target as HTMLInputElement).value })
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
          subtitle="Le répertoire des applications doit être le même chemin absolu que les agents voient dans ZimaOS (bind mount identique hôte → conteneur, ex. /media/GitHub:/media/GitHub)."
        />
        <p class="text-[11px] text-gray-500 max-w-3xl mb-4 leading-relaxed">
          Forge et ZimaOS sont bien <strong>deux conteneurs différents</strong>, mais ils tournent en général sous le{' '}
          <strong>même moteur Docker</strong> sur le NAS : le démon sur l’hôte connaît <em>tous</em> les conteneurs. Quand
          le conteneur Forge exécute <code class="font-mono text-gray-600">docker inspect zimaos</code>, c’est via le
          socket <code class="font-mono text-gray-600">/var/run/docker.sock</code> (ou équivalent) vers cet hôte — ce
          n’est pas Forge qui « entre » dans le conteneur ZimaOS par le réseau applicatif. Sur Vercel / sans accès au
          démon Docker, la sonde échoue : saisie manuelle ou{' '}
          <code class="font-mono text-gray-600">FORGE_DISABLE_ZIMAOS_PATH_PROBE=1</code>.
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
            {reposHealth.zimaosNote && (
              <p class="text-[11px] opacity-90 border-t border-current/10 pt-2 mt-2">{reposHealth.zimaosNote}</p>
            )}
            {probe?.attempted && !dockerUnavailable && (
              <div class="border-t border-current/10 pt-3 mt-2 space-y-2">
                <p class="font-semibold">
                  ZimaOS (Docker){' '}
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
                    Ajustez le compose ZimaOS ou le « Répertoire des applications » pour qu’il corresponde à une{' '}
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
                    {`ZimaOS : ${s.containerPath}`}
                  </option>
                ))}
              </datalist>
            )}
          </FormField>
          {suggestions.length > 0 && (
            <div class="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
              <p class="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                Dossiers montés (bind) — même chemin hôte que dans ZimaOS
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
                        dans ZimaOS : <span class="text-gray-700">{s.containerPath}</span>
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
