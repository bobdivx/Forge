import { useEffect, useState } from 'preact/hooks';

type Config = {
  forgePublicUrl: string;
  zimaosContainerName: string;
  zimaosRuntimeUrl: string;
  ollamaUrl: string;
  forgeReposRoot: string;
  forgeReposRootAgent: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
  zimaosAccessMode: string;
  zimaosHost: string;
  zimaosSshPort: string;
  zimaosSshUser: string;
  zimaosSshAuth: string;
  zimaosSshKeyPath: string;
  [k: string]: string;
};

type ProbePayload = {
  ok?: boolean;
  checks?: Record<string, { ok: boolean; detail: string }>;
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
  onSync: () => void;
  syncing: boolean;
  message: string;
  settings?: Config;
  reposHealth?: ReposHealth | null;
  onRefreshHealth?: () => void;
};



export default function MaintenanceTab({ onSync, syncing, message, settings, reposHealth, onRefreshHealth }: Props) {
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMsg, setSetupMsg] = useState('');


  const [testingProbe, setTestingProbe] = useState(false);
  const [probe, setProbe] = useState<ProbePayload | null>(null);
  const [probeError, setProbeError] = useState('');
  
  const [networkMatrix, setNetworkMatrix] = useState<NetworkMatrixPayload | null>(null);
  const [networkLoading, setNetworkLoading] = useState(false);
  const [networkError, setNetworkError] = useState('');
  const [copyMessage, setCopyMessage] = useState('');

  const runProbe = async () => {
    if (!settings) return;
    setTestingProbe(true);
    setProbe(null);
    setProbeError('');
    try {
      const mode = settings.zimaosAccessMode === 'remote_ssh' ? 'remote_ssh' : 'local_docker';
      const res = await fetch('/api/setup-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate',
          zimaosAccessMode: mode,
          zimaosRuntimeUrl: settings.zimaosRuntimeUrl,
          zimaosContainerName: settings.zimaosContainerName,
          zimaosHost: settings.zimaosHost,
          zimaosSshPort: settings.zimaosSshPort,
          zimaosSshUser: settings.zimaosSshUser,
          zimaosSshAuth: settings.zimaosSshAuth,
          zimaosSshKeyPath: settings.zimaosSshKeyPath,
          ollamaUrl: settings.ollamaUrl,
          forgeReposRoot: settings.forgeReposRoot,
          dockerYamlDir: settings.dockerYamlDir,
          dockerAppDataDir: settings.dockerAppDataDir,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ProbePayload;
      if (!res.ok) {
        setProbeError('Échec du diagnostic ZimaOS.');
        return;
      }
      setProbe(data);
    } catch {
      setProbeError('Erreur réseau pendant le diagnostic.');
    } finally {
      setTestingProbe(false);
    }
  };

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

  const reopenSetupWizard = async () => {
    setSetupLoading(true);
    setSetupMsg('');
    try {
      const res = await fetch('/api/setup-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'restart' }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setSetupMsg(typeof data.error === 'string' ? data.error : 'Impossible de rouvrir l’assistant.');
        return;
      }
      window.location.href = '/setup';
    } catch {
      setSetupMsg('Erreur réseau.');
    } finally {
      setSetupLoading(false);
    }
  };

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

  const sourceBadgeClass = (source?: string) => {
    if (source === 'env') return 'bg-blue-50 text-blue-700 border-blue-200';
    if (source === 'database') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };
  const probeBadgeClass = (ok?: boolean) =>
    ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-rose-50 text-rose-700 border-rose-200';

  const st = reposHealth?.status ?? '';
  const healthyRepos = st === 'ok';
  const healthProbe = reposHealth?.zimaosProbe;
  const bindMounts = (healthProbe?.mounts ?? []).filter((m) => m.type === 'bind' && m.destination);
  const dockerUnavailable = Boolean(healthProbe?.dockerError && /docker.*(enoent|inaccessible)/i.test(healthProbe.dockerError));



  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-gray-500 mb-6">
          Actions pour resynchroniser les données physiques avec la base logicielle.
        </p>

        {/* --- Diagnostics block --- */}
        <div class="mb-8 space-y-4">
          <h3 class="text-sm font-bold text-gray-900 border-b border-gray-100 pb-2">Diagnostics complets</h3>

          {/* Test Communication ZimaOS */}
          <div class="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <div class="flex items-center gap-3 flex-wrap mb-2">
              <button
                type="button"
                onClick={runProbe}
                class="text-xs font-semibold px-4 py-2 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                disabled={testingProbe}
              >
                {testingProbe ? 'Diagnostic…' : 'Tester communication ZimaOS'}
              </button>
              {probeError && <span class="text-xs text-red-700">{probeError}</span>}
            </div>
            {probe?.checks && (
              <ul class="space-y-2 mt-3 text-[11px] rounded-xl border border-gray-200 bg-white p-3">
                {Object.entries(probe.checks).map(([k, v]) => (
                  <li key={k} class={v.ok ? 'text-green-700' : 'text-amber-700'}>
                    <span class="font-semibold">{k}</span> - {v.detail}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Network Matrix */}
          <div class="rounded-xl border border-gray-200 bg-gray-50/70 p-4">
            <div class="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <h4 class="text-sm font-semibold text-gray-900">Matrice Réseau</h4>
                <p class="text-[10px] text-gray-500">Diagnostic live des URLs réellement résolues par le serveur Forge.</p>
              </div>
              <button
                type="button"
                onClick={loadNetworkMatrix}
                class="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60"
                disabled={networkLoading}
              >
                {networkLoading ? 'Diagnostic…' : 'Recharger'}
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
                <div class="flex items-center gap-2 flex-wrap mt-2">
                  <button
                    type="button"
                    onClick={copyNetworkMatrix}
                    class="text-[11px] font-semibold px-3 py-1.5 rounded-lg border border-gray-300 bg-white hover:bg-gray-50"
                  >
                    Copier diagnostic
                  </button>
                  {copyMessage && <p class="text-[11px] text-gray-600">{copyMessage}</p>}
                </div>
              </div>
            )}
          </div>

          {/* Verification Forge + conteneur */}
          {reposHealth && (
            <div
              class={`text-xs rounded-xl px-4 py-3 space-y-2 border ${
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
              {healthProbe?.attempted && !dockerUnavailable && (
                <div class="border-t border-current/10 pt-3 mt-2 space-y-2">
                  <p class="font-semibold">
                    ZimaOS (Docker){' '}
                    {healthProbe.containerName ? <span class="font-mono font-normal">· {healthProbe.containerName}</span> : null}
                  </p>
                  {healthProbe.dockerError && (
                    <p class="text-[11px] text-red-700 bg-red-50/80 rounded px-2 py-1">{healthProbe.dockerError}</p>
                  )}
                  {healthProbe.skipReason && !healthProbe.dockerError && (
                    <p class="text-[11px] opacity-90">{healthProbe.skipReason}</p>
                  )}
                  {healthProbe.pathTested && (
                    <p class="text-[11px] font-mono break-all">
                      Test <code class="text-[10px]">test -d</code> dans le conteneur : <strong>{healthProbe.pathTested}</strong> →{' '}
                      {healthProbe.pathExistsInContainer ? (
                        <span class="text-emerald-700">présent</span>
                      ) : (
                        <span class="text-red-700">absent</span>
                      )}
                      {healthProbe.likelyMountMatch ? ' · bind couvrant ce chemin' : ''}
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
                  {!healthProbe.pathExistsInContainer && healthProbe.attempted && healthProbe.containerName && (
                    <p class="text-[11px]">
                      Ajustez le compose ZimaOS ou le « Répertoire des applications » pour qu’il corresponde à une{' '}
                      <span class="font-mono">Destination</span> listée ci-dessus.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div class="space-y-3">
          <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div class="min-w-0">
              <h4 class="text-sm font-medium text-gray-900">Assistant de configuration</h4>
              <p class="text-[10px] text-gray-400 mt-1">
                Rouvrir le guide (ZimaOS, dépôts, jetons). Utile après un changement de NAS ou de conteneurs.
              </p>
            </div>
            <button
              type="button"
              onClick={reopenSetupWizard}
              disabled={setupLoading}
              class="shrink-0 px-4 py-2 rounded-full text-sm font-medium border border-gray-300 bg-white text-gray-800 hover:bg-gray-50 transition-colors disabled:opacity-50"
            >
              {setupLoading ? 'Préparation…' : 'Relancer l’assistant'}
            </button>
          </div>

          {setupMsg && (
            <p class="text-sm text-red-600 border border-red-100 bg-red-50 rounded-lg px-3 py-2">{setupMsg}</p>
          )}

          <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div class="min-w-0">
              <h4 class="text-sm font-medium text-gray-900">Synchronisation des projets</h4>
              <p class="text-[10px] text-gray-400 mt-1">
                Parcourt le répertoire des applications (Paramètres → Infrastructure), détecte les dossiers avec{' '}
                <span class="font-mono">.git</span> et met à jour Astro DB.
              </p>
            </div>
            <button
              type="button"
              onClick={onSync}
              disabled={syncing}
              class="shrink-0 px-4 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              style="background:#175B37"
            >
              {syncing ? 'Synchronisation…' : 'Lancer la sync'}
            </button>
          </div>



          <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div class="min-w-0">
              <h4 class="text-sm font-medium text-gray-900">Sauvegarde de la base de données</h4>
              <p class="text-[10px] text-gray-400 mt-1">
                Effectue une sauvegarde horodatée de la base Astro DB.
              </p>
            </div>
            <button
              type="button"
              disabled
              class="shrink-0 px-4 py-2 rounded-full text-sm font-medium border border-gray-300 text-gray-400 opacity-40 cursor-not-allowed"
            >
              Bientôt disponible
            </button>
          </div>
        </div>
      </div>

      {message && (
        <p
          class={`text-sm pt-4 border-t border-gray-200 font-medium ${message.includes('Erreur') ? 'text-red-500' : 'text-green-600'}`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
