import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type Config = { forgeReposRoot: string; dockerYamlDir: string; dockerAppDataDir: string; [k: string]: string };

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

type ReposHealth = {
  status?: string;
  summary?: string;
  path?: string;
  gitReposFound?: number;
  openclawNote?: string;
  openclawProbe?: OpenClawProbe;
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

const inputCls = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition font-mono';

export default function InfraTab({
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

  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-gray-500 mb-4">
          Le répertoire des applications contient un dossier par application (dépôt Git cloné). Les dossiers Docker
          servent de repères pour vos stacks ; adaptez-les à votre NAS (ex. <span class="font-mono">/media/…</span>).
        </p>
        {reposHealth && (
          <div
            class={`text-xs rounded-xl px-4 py-3 mb-4 space-y-2 border ${
              healthyRepos
                ? 'bg-emerald-50/90 border-emerald-100 text-emerald-900'
                : 'bg-amber-50/90 border-amber-100 text-amber-950'
            }`}
            role="status"
          >
            <div class="flex items-start justify-between gap-2 flex-wrap">
              <p class="font-semibold">
                État du répertoire (vu par Forge){' '}
                <span class="font-normal opacity-80">
                  {reposHealth.path ? `→ ${reposHealth.path}` : ''}
                </span>
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
              <p class="font-mono text-[11px] opacity-90">
                Dépôts Git détectés : {reposHealth.gitReposFound}
              </p>
            )}
            {reposHealth.openclawNote && (
              <p class="text-[11px] opacity-90 border-t border-current/10 pt-2 mt-2">{reposHealth.openclawNote}</p>
            )}
            {probe?.attempted && (
              <div class="border-t border-current/10 pt-3 mt-2 space-y-2">
                <p class="font-semibold">
                  OpenClaw (Docker){' '}
                  {probe.containerName ? (
                    <span class="font-mono font-normal">· {probe.containerName}</span>
                  ) : null}
                </p>
                {probe.dockerError && (
                  <p class="text-[11px] text-red-700 bg-red-50/80 rounded px-2 py-1">{probe.dockerError}</p>
                )}
                {probe.skipReason && !probe.dockerError && (
                  <p class="text-[11px] opacity-90">{probe.skipReason}</p>
                )}
                {probe.pathTested && (
                  <p class="text-[11px] font-mono break-all">
                    Test dans le conteneur : <strong>{probe.pathTested}</strong> →{' '}
                    {probe.pathExistsInContainer ? (
                      <span class="text-emerald-700">présent</span>
                    ) : (
                      <span class="text-red-700">absent</span>
                    )}
                    {probe.likelyMountMatch ? ' · bind mount couvrant ce chemin' : ''}
                  </p>
                )}
                {bindMounts.length > 0 && (
                  <details class="text-[11px]">
                    <summary class="cursor-pointer font-medium opacity-90">
                      Volumes bind ({bindMounts.length}) — chemins vus dans le conteneur
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
                    Corrigez le compose OpenClaw pour monter le dossier hôte des apps au même chemin que ci-dessus, ou
                    ajustez « Répertoire des applications » pour qu’il corresponde à un <span class="font-mono">Destination</span>{' '}
                    listé.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        <div
          class="text-xs text-gray-600 bg-amber-50/80 border border-amber-100 rounded-xl px-4 py-3 mb-6 space-y-2"
          role="note"
        >
          <p class="font-semibold text-amber-900">Cohérence avec OpenClaw</p>
          <p>
            Ce chemin est celui que <strong>Forge</strong> (le serveur du dashboard) utilise sur <strong>l’hôte</strong>{' '}
            pour lire les dépôts. Les <strong>agents</strong> tournent dans le <strong>conteneur OpenClaw</strong> : ils
            ne voient que ce qui y est <strong>monté en volume</strong>. Pour qu’une appli soit modifiable par un agent,
            le <span class="font-mono">bind mount</span> OpenClaw doit exposer <strong>le même répertoire hôte</strong> et
            de préférence <strong>le même chemin absolu</strong> (ex. hôte <span class="font-mono">/media/GitHub</span> →
            conteneur <span class="font-mono">/media/GitHub</span>).
          </p>
          <p class="text-amber-800/90">
            En pratique : saisissez ici <strong>exactement</strong> le chemin que les agents doivent utiliser dans leurs
            outils shell. S’il diffère (ex. <span class="font-mono">/forge/work</span> dans OpenClaw), alignez le
            paramètre sur ce chemin <em>à l’intérieur</em> du conteneur, et montez le disque hôte vers ce point.
          </p>
        </div>
        <div class="space-y-4">
          <FormField
            label="Répertoire des applications"
            hint="Doit coïncider avec le volume des apps côté conteneur OpenClaw (même arbo Git)"
          >
            <input
              type="text"
              value={settings.forgeReposRoot}
              onInput={(e) =>
                setSettings({ ...settings, forgeReposRoot: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
          <FormField label="Dossier Docker YAML">
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
      </div>
      <SaveRow message={message} saving={saving} onSave={onSave} label="Sauvegarder les chemins" />
    </div>
  );
}
