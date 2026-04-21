import { useEffect, useState } from 'preact/hooks';

type Props = {
  onSync: () => void;
  syncing: boolean;
  message: string;
  onOpenClawRepaired?: () => void | Promise<void>;
};

type OpenClawSyncStatus = {
  ok?: boolean;
  mode?: string;
  upToDate?: boolean;
  toAdd?: string[];
  current?: string[];
  warning?: string;
  error?: string;
  virtualRegistry?: string[];
};

type OpenClawSyncPost = {
  ok?: boolean;
  synchronized?: number;
  mode?: string;
  via?: string | null;
  note?: string;
  error?: string;
  autoEnabled?: string[];
  adoptedFromGateway?: boolean;
};

type OpenClawDirectiveResponse = {
  ok?: boolean;
  error?: string;
  via?: string;
};

type OpenClawRepairPayload = {
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

export default function MaintenanceTab({ onSync, syncing, message, onOpenClawRepaired }: Props) {
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupMsg, setSetupMsg] = useState('');
  const [openclawRepairing, setOpenclawRepairing] = useState(false);
  const [restartDockerAfterFail, setRestartDockerAfterFail] = useState(false);
  const [openclawRepairResult, setOpenclawRepairResult] = useState<OpenClawRepairPayload | null>(null);
  const [syncAgentsLoading, setSyncAgentsLoading] = useState(false);
  const [syncAgentsStatus, setSyncAgentsStatus] = useState<OpenClawSyncStatus | null>(null);
  const [syncAgentsResult, setSyncAgentsResult] = useState<OpenClawSyncPost | null>(null);
  const [sendingFixPrompt, setSendingFixPrompt] = useState(false);
  const [sendFixPromptMsg, setSendFixPromptMsg] = useState('');

  const loadOpenClawSyncStatus = async () => {
    try {
      const res = await fetch('/api/openclaw-sync-agents');
      const data = (await res.json().catch(() => ({}))) as OpenClawSyncStatus;
      setSyncAgentsStatus(data);
    } catch {
      setSyncAgentsStatus({ ok: false, error: 'Impossible de lire l’état OpenClaw.' });
    }
  };

  const syncOpenClawAgents = async () => {
    setSyncAgentsLoading(true);
    setSyncAgentsResult(null);
    try {
      const res = await fetch('/api/openclaw-sync-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as OpenClawSyncPost;
      setSyncAgentsResult(data);
      await loadOpenClawSyncStatus();
    } catch {
      setSyncAgentsResult({ ok: false, error: 'Erreur réseau pendant la synchronisation OpenClaw.' });
    } finally {
      setSyncAgentsLoading(false);
    }
  };

  const buildGatewayWritePrompt = () => {
    const targetAgent = Array.isArray(syncAgentsStatus?.current) && syncAgentsStatus?.current.length
      ? syncAgentsStatus.current[0]
      : 'chef_technique';
    return [
      'Action demandee: passer le gateway OpenClaw en mode ecriture pour la gestion des agents Forge.',
      '',
      'Contexte:',
      '- Forge est en mode "api-virtual" (gateway read-only).',
      '- Lecture agents_list OK, mais ecriture agents impossible.',
      '',
      'A faire sur OpenClaw:',
      '1) Ouvrir le fichier openclaw.json de la gateway.',
      '2) Autoriser les tools HTTP d ecriture des agents via /tools/invoke:',
      '   - agents_upsert',
      '   - agents_set',
      '   - agents_sync',
      '   (conserver aussi agents_list).',
      '3) Redemarrer le service/container OpenClaw gateway.',
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
      const res = await fetch('/api/openclaw-directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: target,
          message: prompt,
          timeoutSeconds: 90,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as OpenClawDirectiveResponse;
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

  const handleOpenClawAutoRepair = async () => {
    setOpenclawRepairing(true);
    setOpenclawRepairResult(null);
    try {
      const res = await fetch('/api/openclaw-auto-repair', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ restartDocker: restartDockerAfterFail }),
      });
      const data = (await res.json().catch(() => ({}))) as OpenClawRepairPayload & { error?: string };
      if (!res.ok && data.error) {
        setOpenclawRepairResult({ error: data.error, actions: [] });
        return;
      }
      setOpenclawRepairResult(data);
      if ((data.repaired || data.alreadyOk) && onOpenClawRepaired) {
        await onOpenClawRepaired();
      }
    } catch {
      setOpenclawRepairResult({ error: 'Erreur réseau', actions: [] });
    } finally {
      setOpenclawRepairing(false);
    }
  };

  useEffect(() => {
    void loadOpenClawSyncStatus();
  }, []);

  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-gray-500 mb-6">
          Actions pour resynchroniser les données physiques avec la base logicielle.
        </p>

        <div class="space-y-3">
          <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 flex items-center justify-between gap-4">
            <div class="min-w-0">
              <h4 class="text-sm font-medium text-gray-900">Assistant de configuration</h4>
              <p class="text-[10px] text-gray-400 mt-1">
                Rouvrir le guide (OpenClaw, dépôts, jetons). Utile après un changement de NAS ou de conteneurs.
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
                <h4 class="text-sm font-medium text-gray-900">Synchronisation des agents OpenClaw</h4>
                <p class="text-[10px] text-gray-400 mt-1">
                  Pousse la liste des agents Forge vers OpenClaw. Si le gateway est en lecture seule, Forge bascule en
                  mode virtuel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void syncOpenClawAgents()}
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
                  Gateway en lecture seule : envoyez une consigne de correction a OpenClaw.
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
                    {sendingFixPrompt ? 'Envoi…' : 'Envoyer a un agent OpenClaw'}
                  </button>
                </div>
                {sendFixPromptMsg && <p class="text-[11px] text-amber-900">{sendFixPromptMsg}</p>}
              </div>
            )}
          </div>

          <div class="rounded-xl border border-[#175B37]/25 bg-[#E9F3EB]/40 p-4 space-y-3">
            <p class="text-xs font-semibold text-gray-900">Diagnostic & réparation automatiques (OpenClaw)</p>
            <p class="text-[11px] text-gray-600 leading-relaxed">
              Forge teste plusieurs URL (127.0.0.1, LAN depuis <span class="font-mono">trustedProxies</span>, etc.) et
              des jetons (fichier <span class="font-mono">openclaw.json</span>, base Config, variable d’environnement).
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
              OpenClaw puis resonder.
            </label>
            <div class="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={openclawRepairing}
                onClick={() => void handleOpenClawAutoRepair()}
                class="inline-flex items-center justify-center rounded-lg bg-[#175B37] px-4 py-2 text-xs font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-50"
              >
                {openclawRepairing ? 'Diagnostic en cours…' : 'Diagnostiquer et réparer OpenClaw'}
              </button>
            </div>
            {openclawRepairResult && (
              <div
                class={`text-[11px] rounded-lg px-3 py-2 space-y-1 border ${
                  openclawRepairResult.error && !openclawRepairResult.alreadyOk
                    ? 'bg-red-50 border-red-100 text-red-900'
                    : openclawRepairResult.alreadyOk
                      ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                      : openclawRepairResult.repaired
                        ? 'bg-emerald-50 border-emerald-100 text-emerald-900'
                        : 'bg-amber-50 border-amber-100 text-amber-950'
                }`}
                role="status"
              >
                {openclawRepairResult.error && <p class="font-medium">{openclawRepairResult.error}</p>}
                {openclawRepairResult.winner?.baseUrl && (
                  <p class="font-mono break-all">
                    Passerelle : {openclawRepairResult.winner.baseUrl}{' '}
                    <span class="text-gray-600">(jeton : {openclawRepairResult.winner.tokenSource || '—'})</span>
                  </p>
                )}
                {openclawRepairResult.saved && (
                  <p class="opacity-90">
                    Enregistré — URL : {openclawRepairResult.saved.gatewayUrl ? 'oui' : 'non'}, jeton :{' '}
                    {openclawRepairResult.saved.token ? 'oui' : 'non'}, AppData :{' '}
                    {openclawRepairResult.saved.dockerAppDataDir ? 'oui' : 'non'}
                  </p>
                )}
                {typeof openclawRepairResult.probesTried === 'number' && (
                  <p class="opacity-80">Sondes : {openclawRepairResult.probesTried}</p>
                )}
                {openclawRepairResult.dockerRestart && (
                  <p>
                    Docker :{' '}
                    {openclawRepairResult.dockerRestart.ok
                      ? `redémarrage OK (${openclawRepairResult.dockerRestart.container || '?'})`
                      : `échec — ${openclawRepairResult.dockerRestart.error || 'inconnu'}`}
                  </p>
                )}
                {(openclawRepairResult.warnings?.length ?? 0) > 0 && (
                  <ul class="list-disc pl-4 text-amber-900">
                    {openclawRepairResult.warnings!.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                )}
                {(openclawRepairResult.actions?.length ?? 0) > 0 && (
                  <ul class="list-disc pl-4 mt-1">
                    {openclawRepairResult.actions!.map((a) => (
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
