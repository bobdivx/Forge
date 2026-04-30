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
  onZimaOSRepaired?: () => void | Promise<void>;
  settings?: Config;
  reposHealth?: ReposHealth | null;
  onRefreshHealth?: () => void;
};

type ZimaOSSyncStatus = {
  ok?: boolean;
  mode?: string;
  upToDate?: boolean;
  toAdd?: string[];
  current?: string[];
  warning?: string;
  error?: string;
  virtualRegistry?: string[];
  subagentPolicy?: {
    ok?: boolean;
    issues?: string[];
    maxSpawnDepth?: number;
  };
};

type ZimaOSSyncPost = {
  ok?: boolean;
  synchronized?: number;
  mode?: string;
  via?: string | null;
  note?: string;
  error?: string;
  autoEnabled?: string[];
  adoptedFromGateway?: boolean;
};

type ZimaOSDirectiveResponse = {
  ok?: boolean;
  error?: string;
  via?: string;
};

type ZimaOSRepairPayload = {
  alreadyOk?: boolean;
  repaired?: boolean;
  error?: string;
  actions?: string[];
  warnings?: string[];
  winner?: { baseUrl?: string; tokenSource?: string };
  saved?: { gatewayUrl?: boolean; token?: boolean; dockerAppDataDir?: boolean };
  probesTried?: number;
  dockerRestart?: { ok?: boolean; container?: string; error?: string };
};

export default function MaintenanceTab({ onSync, syncing, message, onZimaOSRepaired, settings, reposHealth, onRefreshHealth }: Props) {
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMsg, setSetupMsg] = useState('');
  const [zimaosRepairing, setZimaOSRepairing] = useState(false);
  const [restartDockerAfterFail, setRestartDockerAfterFail] = useState(false);
  const [zimaosRepairResult, setZimaOSRepairResult] = useState<ZimaOSRepairPayload | null>(null);
  const [syncAgentsLoading, setSyncAgentsLoading] = useState(false);
  const [syncAgentsStatus, setSyncAgentsStatus] = useState<ZimaOSSyncStatus | null>(null);
  const [syncAgentsResult, setSyncAgentsResult] = useState<ZimaOSSyncPost | null>(null);
  const [sendingFixPrompt, setSendingFixPrompt] = useState(false);
  const [sendFixPromptMsg, setSendFixPromptMsg] = useState('');

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

  const loadZimaOSSyncStatus = async () => {
    try {
      const res = await fetch('/api/zimaos-sync-agents');
      const data = (await res.json().catch(() => ({}))) as ZimaOSSyncStatus;
      setSyncAgentsStatus(data);
    } catch {
      setSyncAgentsStatus({ ok: false, error: 'Impossible de lire l’état ZimaOS.' });
    }
  };

  const syncZimaOSAgents = async () => {
    setSyncAgentsLoading(true);
    setSyncAgentsResult(null);
    try {
      const res = await fetch('/api/zimaos-sync-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as ZimaOSSyncPost;
      setSyncAgentsResult(data);
      await loadZimaOSSyncStatus();
    } catch {
      setSyncAgentsResult({ ok: false, error: 'Erreur réseau pendant la synchronisation ZimaOS.' });
    } finally {
      setSyncAgentsLoading(false);
    }
  };

  const buildGatewayWritePrompt = () => {
    const targetAgent = Array.isArray(syncAgentsStatus?.current) && syncAgentsStatus?.current.length
      ? syncAgentsStatus.current[0]
      : 'chef_technique';
    return [
      'Action demandee: passer le gateway ZimaOS en mode ecriture pour la gestion des agents Forge.',
      '',
      'Contexte:',
      '- Forge est en mode "api-virtual" (gateway read-only).',
      '- Lecture agents_list OK, mais ecriture agents impossible.',
      '',
      'A faire sur ZimaOS:',
      '1) Ouvrir le fichier zimaos.json de la gateway.',
      '2) Autoriser les tools HTTP d ecriture des agents via /tools/invoke:',
      '   - agents_upsert',
      '   - agents_set',
      '   - agents_sync',
      '   (conserver aussi agents_list).',
      '3) Redemarrer le service/container ZimaOS gateway.',
      '4) Verifier qu un POST /tools/invoke avec tool=agents_upsert ne retourne plus "Tool not available".',
      '5) Repondre "OK ecriture agents activee".',
      '',
      `Agent cible conseille: ${targetAgent}`,
    ].join('\n');
  };

  const copyGatewayWritePrompt = async () => {
    const prompt = buildGatewayWritePrompt();
    try {
      await navigator.clipboard.writeText(prompt);
      setSendFixPromptMsg('Prompt copie dans le presse-papiers.');
    } catch {
      setSendFixPromptMsg('Copie impossible automatiquement. Copiez le texte manuellement.');
    }
  };

  const sendGatewayWritePrompt = async () => {
    const prompt = buildGatewayWritePrompt();
    const target = Array.isArray(syncAgentsStatus?.current) && syncAgentsStatus.current.length
      ? syncAgentsStatus.current[0]
      : 'chef_technique';
    setSendingFixPrompt(true);
    setSendFixPromptMsg('');
    try {
      const res = await fetch('/api/zimaos-directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: target,
          message: prompt,
          timeoutSeconds: 90,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as ZimaOSDirectiveResponse;
      if (!res.ok || data.ok === false) {
        setSendFixPromptMsg(data.error || 'Envoi refuse par le gateway.');
        return;
      }
      setSendFixPromptMsg(`Prompt envoye a ${target}${data.via ? ` (via ${data.via})` : ''}.`);
    } catch {
      setSendFixPromptMsg('Erreur reseau pendant l’envoi du prompt.');
    } finally {
      setSendingFixPrompt(false);
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
      if (res.ok) {
        window.location.href = '/setup';
        return;
      }
      const d = await res.json().catch(() => ({}));
      setSetupMsg(String(d.error || 'Impossible de relancer l’assistant.'));
    } catch {
      setSetupMsg('Erreur réseau.');
    } finally {
      setSetupLoading(false);
    }
  };

  const handleZimaOSAutoRepair = async () => {
    setZimaOSRepairing(true);
    setZimaOSRepairResult(null);
    try {
      const res = await fetch('/api/zimaos-auto-repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restartDocker: restartDockerAfterFail }),
      });
      const data = (await res.json().catch(() => ({}))) as ZimaOSRepairPayload & { error?: string };
      if (!res.ok && data.error) {
        setZimaOSRepairResult({ error: data.error, actions: [] });
        return;
      }
      setZimaOSRepairResult(data);
      if ((data.repaired || data.alreadyOk) && onZimaOSRepaired) {
        await onZimaOSRepaired();
      }
    } catch {
      setZimaOSRepairResult({ error: 'Erreur réseau', actions: [] });
    } finally {
      setZimaOSRepairing(false);
    }
  };

  useEffect(() => {
    void loadZimaOSSyncStatus();
  }, []);

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

          <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0">
                <h4 class="text-sm font-medium text-gray-900">Synchronisation des agents ZimaOS</h4>
                <p class="text-[10px] text-gray-400 mt-1">
                  Pousse la liste des agents Forge vers ZimaOS. Si le gateway est en lecture seule, Forge bascule en
                  mode virtuel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void syncZimaOSAgents()}
                disabled={syncAgentsLoading}
                class="shrink-0 px-4 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                style="background:#175B37"
              >
                {syncAgentsLoading ? 'Synchronisation…' : 'Synchroniser agents'}
              </button>
            </div>

            {syncAgentsStatus && (
              <div class="text-[11px] rounded-lg border border-gray-200 bg-white px-3 py-2 flex flex-wrap items-center gap-2">
                {syncAgentsStatus.mode === 'api-virtual' ? (
                  <span class="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-amber-900 font-medium">
                    Synchro virtuelle (gateway read-only)
                  </span>
                ) : syncAgentsStatus.subagentPolicy?.ok === false ? (
                  <span class="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-amber-900 font-medium">
                    Permissions subagents à réparer
                  </span>
                ) : syncAgentsStatus.upToDate ? (
                  <span class="inline-flex items-center rounded-full border border-emerald-300 bg-emerald-100 px-2 py-0.5 text-emerald-900 font-medium">
                    Agents synchronisés
                  </span>
                ) : (
                  <span class="inline-flex items-center rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-amber-900 font-medium">
                    Synchronisation incomplète
                  </span>
                )}

                {typeof syncAgentsStatus.mode === 'string' && (
                  <span class="text-gray-600">mode: <span class="font-mono">{syncAgentsStatus.mode}</span></span>
                )}
                {Array.isArray(syncAgentsStatus.toAdd) && syncAgentsStatus.toAdd.length > 0 && (
                  <span class="text-gray-700">
                    manquants: <span class="font-mono">{syncAgentsStatus.toAdd.join(', ')}</span>
                  </span>
                )}
                {Array.isArray(syncAgentsStatus.virtualRegistry) && syncAgentsStatus.virtualRegistry.length > 0 && (
                  <span class="text-gray-700">
                    registre virtuel: <span class="font-mono">{syncAgentsStatus.virtualRegistry.join(', ')}</span>
                  </span>
                )}
                {syncAgentsStatus.warning && <span class="text-amber-800">{syncAgentsStatus.warning}</span>}
                {syncAgentsStatus.subagentPolicy?.ok === false &&
                  Array.isArray(syncAgentsStatus.subagentPolicy.issues) &&
                  syncAgentsStatus.subagentPolicy.issues.length > 0 && (
                    <span class="text-amber-900">
                      permissions: {syncAgentsStatus.subagentPolicy.issues.length} anomalie(s) détectée(s)
                    </span>
                  )}
                {syncAgentsStatus.error && <span class="text-red-700">{syncAgentsStatus.error}</span>}
              </div>
            )}

            {syncAgentsResult && (
              <div class="space-y-1">
                <p class={`text-[11px] ${syncAgentsResult.ok ? 'text-emerald-700' : 'text-red-700'}`}>
                  {syncAgentsResult.ok
                    ? `Synchronisation terminée (${syncAgentsResult.synchronized ?? 0} agent(s), mode ${syncAgentsResult.mode || 'n/a'}).`
                    : syncAgentsResult.error || 'Échec de la synchronisation des agents.'}
                  {syncAgentsResult.note ? ` ${syncAgentsResult.note}` : ''}
                  {syncAgentsResult.adoptedFromGateway
                    ? ' Aucun agent actif en base Forge: reprise automatique depuis agents_list du gateway.'
                    : ''}
                </p>
                {Array.isArray(syncAgentsResult.autoEnabled) && syncAgentsResult.autoEnabled.length > 0 && (
                  <div class="text-[11px] flex flex-wrap items-center gap-2">
                    <span class="inline-flex items-center rounded-full border border-sky-300 bg-sky-100 px-2 py-0.5 text-sky-900 font-medium">
                      Auto-activation effectuée
                    </span>
                    <span class="text-sky-900 font-mono">{syncAgentsResult.autoEnabled.join(', ')}</span>
                  </div>
                )}
              </div>
            )}

            {syncAgentsStatus?.mode === 'api-virtual' && (
              <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
                <p class="text-[11px] text-amber-950 font-medium">
                  Gateway en lecture seule : envoyez une consigne de correction a ZimaOS.
                </p>
                <pre class="text-[10px] text-amber-900 whitespace-pre-wrap font-mono bg-white/70 border border-amber-100 rounded p-2">
                  {buildGatewayWritePrompt()}
                </pre>
                <div class="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void copyGatewayWritePrompt()}
                    class="inline-flex items-center justify-center rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
                  >
                    Copier le prompt
                  </button>
                  <button
                    type="button"
                    disabled={sendingFixPrompt}
                    onClick={() => void sendGatewayWritePrompt()}
                    class="inline-flex items-center justify-center rounded-lg bg-amber-700 px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-95 disabled:opacity-50"
                  >
                    {sendingFixPrompt ? 'Envoi…' : 'Envoyer a un agent ZimaOS'}
                  </button>
                </div>
                {sendFixPromptMsg && <p class="text-[11px] text-amber-900">{sendFixPromptMsg}</p>}
              </div>
            )}
          </div>

          <div class="rounded-xl border border-[#175B37]/25 bg-[#E9F3EB]/40 p-4 space-y-3">
            <p class="text-xs font-semibold text-gray-900">Diagnostic & réparation automatiques (ZimaOS)</p>
            <p class="text-[11px] text-gray-600 leading-relaxed">
              Forge teste plusieurs URL (127.0.0.1, LAN depuis <span class="font-mono">trustedProxies</span>, etc.) et
              des jetons (fichier <span class="font-mono">zimaos.json</span>, base Config, variable d’environnement).
              En cas de succès, l’URL et le jeton sont enregistrés dans la table Config (sauf si des variables
              d’environnement les remplacent).
            </p>
            <label class="flex items-center gap-2 text-[11px] text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={restartDockerAfterFail}
                onChange={() => setRestartDockerAfterFail(!restartDockerAfterFail)}
                class="rounded border-gray-300"
              />
              Si aucune combinaison ne répond, tenter <span class="font-mono">docker restart</span> sur le conteneur
              ZimaOS puis resonder.
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={zimaosRepairing}
                onClick={() => void handleZimaOSAutoRepair()}
                class="inline-flex items-center justify-center rounded-lg bg-[#175B37] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                {zimaosRepairing ? 'Diagnostic en cours…' : 'Diagnostiquer et réparer ZimaOS'}
              </button>
            </div>
            {zimaosRepairResult && (
              <div
                class={`text-[11px] rounded-lg px-3 py-2 space-y-1 border ${
                  zimaosRepairResult.error && !zimaosRepairResult.alreadyOk
                    ? 'bg-red-50 border-red-100 text-red-900'
                    : zimaosRepairResult.alreadyOk
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                      : zimaosRepairResult.repaired
                        ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                        : 'bg-amber-50 border-amber-100 text-amber-950'
                }`}
                role="status"
              >
                {zimaosRepairResult.error && <p class="font-medium">{zimaosRepairResult.error}</p>}
                {zimaosRepairResult.winner?.baseUrl && (
                  <p class="font-mono break-all">
                    Passerelle : {zimaosRepairResult.winner.baseUrl}{' '}
                    <span class="text-gray-600">(jeton : {zimaosRepairResult.winner.tokenSource || '—'})</span>
                  </p>
                )}
                {zimaosRepairResult.saved && (
                  <p class="opacity-90">
                    Enregistré — URL : {zimaosRepairResult.saved.gatewayUrl ? 'oui' : 'non'}, jeton :{' '}
                    {zimaosRepairResult.saved.token ? 'oui' : 'non'}, AppData :{' '}
                    {zimaosRepairResult.saved.dockerAppDataDir ? 'oui' : 'non'}
                  </p>
                )}
                {typeof zimaosRepairResult.probesTried === 'number' && (
                  <p class="opacity-80">Sondes : {zimaosRepairResult.probesTried}</p>
                )}
                {zimaosRepairResult.dockerRestart && (
                  <p>
                    Docker :{' '}
                    {zimaosRepairResult.dockerRestart.ok
                      ? `redémarrage OK (${zimaosRepairResult.dockerRestart.container || '?'})`
                      : `échec — ${zimaosRepairResult.dockerRestart.error || 'inconnu'}`}
                  </p>
                )}
                {(zimaosRepairResult.warnings?.length ?? 0) > 0 && (
                  <ul class="list-disc pl-4 text-amber-900">
                    {zimaosRepairResult.warnings!.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                {(zimaosRepairResult.actions?.length ?? 0) > 0 && (
                  <ul class="list-disc pl-4 mt-1">
                    {zimaosRepairResult.actions!.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
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
