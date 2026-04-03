import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type Config = { githubToken: string; vercelToken: string; [k: string]: string };

type Props = {
  settings: Config;
  setSettings: (c: Config) => void;
  onSave: () => void;
  saving: boolean;
  message: string;
};

export default function ApiTokensTab({ settings, setSettings, onSave, saving, message }: Props) {
  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-slate-400 mb-6">
          Utilisés par les agents pour automatiser vos déploiements GitHub et Vercel.
        </p>
        <div class="space-y-4">
          <FormField label="GitHub (PAT)">
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              value={settings.githubToken}
              onInput={(e) =>
                setSettings({ ...settings, githubToken: (e.target as HTMLInputElement).value })
              }
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono"
            />
          </FormField>
          <FormField label="Vercel Token">
            <input
              type="password"
              placeholder="xxxxxxxxxxxx"
              value={settings.vercelToken}
              onInput={(e) =>
                setSettings({ ...settings, vercelToken: (e.target as HTMLInputElement).value })
              }
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono"
            />
          </FormField>
        </div>
      </div>
      <SaveRow message={message} saving={saving} onSave={onSave} label="Sauvegarder les jetons" />
    </div>
  );
}
