import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type Config = {
  forgePublicUrl: string;
  openclawContainerName: string;
  openclawGatewayUrl: string;
  openclawToken: string;
  [k: string]: string;
};

type Props = {
  settings: Config;
  setSettings: (c: Config) => void;
  onSave: () => void;
  saving: boolean;
  message: string;
};

const inputCls = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition font-mono';

export default function OpenClawTab({ settings, setSettings, onSave, saving, message }: Props) {
  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-gray-500 mb-6">
          Configurez la liaison entre ce dashboard et votre instance OpenClaw. Les vérifications passent par le{' '}
          <strong class="text-gray-700">serveur Forge</strong> (API <code class="text-gray-500">/api/openclaw-health</code>), pas par votre navigateur : utilisez une URL joignable depuis l'hôte qui exécute Astro (hostname LAN, tunnel, ou variable{' '}
          <code class="text-gray-500">OPENCLAW_GATEWAY_URL</code> en production).{' '}
          <code class="text-gray-500">localhost</code> ne fonctionne pas si Forge tourne sur Vercel ou un autre serveur distant.
        </p>
        <div class="space-y-4">
          <FormField
            label="Nom du conteneur OpenClaw (Docker)"
            hint="Laissez vide pour détecter automatiquement (docker ps, nom contenant openclaw). Renseignez si votre conteneur a un autre nom. Permet à Forge de lister les volumes et de vérifier que le répertoire des apps existe dans le conteneur."
          >
            <input
              type="text"
              placeholder="openclaw"
              value={settings.openclawContainerName}
              onInput={(e) =>
                setSettings({ ...settings, openclawContainerName: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
          <FormField
            label="URL Forge joignable par les agents (hooks)"
            hint="Basée vue « depuis OpenClaw », pas depuis le navigateur (ex. http://forge-host:4321 avec extra_hosts, ou http://forge:4321 sur le réseau compose). Vide = secours variables d'environnement / localhost."
          >
            <input
              type="url"
              placeholder="http://forge-host:4321 ou laisser vide pour défaut"
              value={settings.forgePublicUrl}
              onInput={(e) =>
                setSettings({ ...settings, forgePublicUrl: (e.target as HTMLInputElement).value })
              }
              class={inputCls}
            />
          </FormField>
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
              class={inputCls}
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
              class={inputCls}
            />
          </FormField>
        </div>
      </div>
      <SaveRow message={message} saving={saving} onSave={onSave} label="Sauvegarder la connexion" />
    </div>
  );
}
