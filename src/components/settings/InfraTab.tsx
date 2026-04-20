import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type Config = { forgeReposRoot: string; dockerYamlDir: string; dockerAppDataDir: string; [k: string]: string };

type Props = {
  settings: Config;
  setSettings: (c: Config) => void;
  onSave: () => void;
  saving: boolean;
  message: string;
};

const inputCls = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition font-mono';

export default function InfraTab({ settings, setSettings, onSave, saving, message }: Props) {
  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-gray-500 mb-4">
          Le répertoire des applications contient un dossier par application (dépôt Git cloné). Les dossiers Docker
          servent de repères pour vos stacks ; adaptez-les à votre NAS (ex. <span class="font-mono">/media/…</span>).
        </p>
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
