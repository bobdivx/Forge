import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type Config = { openclawGatewayUrl: string; openclawToken: string; [k: string]: string };

type Props = {
  settings: Config;
  setSettings: (c: Config) => void;
  onSave: () => void;
  saving: boolean;
  message: string;
};

export default function OpenClawTab({ settings, setSettings, onSave, saving, message }: Props) {
  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-slate-400 mb-6">
          Configurez la liaison entre ce dashboard et votre instance OpenClaw.
        </p>
        <div class="space-y-4">
          <FormField
            label="URL du gateway"
            hint="Adresse où OpenClaw écoute (défaut : 18789)."
          >
            <input
              type="url"
              placeholder="http://127.0.0.1:18789"
              value={settings.openclawGatewayUrl}
              onInput={(e) =>
                setSettings({ ...settings, openclawGatewayUrl: (e.target as HTMLInputElement).value })
              }
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono"
            />
          </FormField>
          <FormField label="Token d'accès (Gateway Token)">
            <input
              type="password"
              placeholder="Token défini dans openclaw.json"
              value={settings.openclawToken}
              onInput={(e) =>
                setSettings({ ...settings, openclawToken: (e.target as HTMLInputElement).value })
              }
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono"
            />
          </FormField>
        </div>
      </div>
      <SaveRow message={message} saving={saving} onSave={onSave} label="Sauvegarder la connexion" />
    </div>
  );
}
