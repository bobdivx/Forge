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
          Configurez la liaison entre ce dashboard et votre instance OpenClaw. Les vérifications passent par le{' '}
          <strong class="text-slate-300">serveur Forge</strong> (API <code class="text-slate-500">/api/openclaw-health</code>), pas par votre navigateur : utilisez une URL joignable depuis l’hôte qui exécute Astro (hostname LAN, tunnel, ou variable{' '}
          <code class="text-slate-500">OPENCLAW_GATEWAY_URL</code> en production).           <code class="text-slate-500">localhost</code> ne fonctionne pas si Forge tourne sur Vercel ou un autre serveur distant.
        </p>
        <div class="space-y-4">
          <FormField
            label="URL du gateway"
            hint="Adresse où OpenClaw écoute (défaut seed / config : 24190)."
          >
            <input
              type="url"
              placeholder="http://127.0.0.1:24190"
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
