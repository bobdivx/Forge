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

export default function InfraTab({ settings, setSettings, onSave, saving, message }: Props) {
  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-slate-400 mb-6">
          Définissez les dossiers racines pour les dépôts et les données Docker (recommandé : /mnt/).
        </p>
        <div class="space-y-4">
          <FormField label="Racine des Dépôts GitHub">
            <input
              type="text"
              value={settings.forgeReposRoot}
              onInput={(e) =>
                setSettings({ ...settings, forgeReposRoot: (e.target as HTMLInputElement).value })
              }
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono"
            />
          </FormField>
          <FormField label="Dossier Docker YAML">
            <input
              type="text"
              value={settings.dockerYamlDir}
              onInput={(e) =>
                setSettings({ ...settings, dockerYamlDir: (e.target as HTMLInputElement).value })
              }
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono"
            />
          </FormField>
          <FormField label="Dossier AppData Docker">
            <input
              type="text"
              value={settings.dockerAppDataDir}
              onInput={(e) =>
                setSettings({ ...settings, dockerAppDataDir: (e.target as HTMLInputElement).value })
              }
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono"
            />
          </FormField>
        </div>
      </div>
      <SaveRow message={message} saving={saving} onSave={onSave} label="Sauvegarder les chemins" />
    </div>
  );
}
