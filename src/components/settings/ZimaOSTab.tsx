import { useState } from 'preact/hooks';
import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type Config = {
  zimaosAccessMode: string;
  zimaosRuntimeUrl: string;
  zimaosContainerName: string;
  zimaosHost: string;
  zimaosSshPort: string;
  zimaosSshUser: string;
  zimaosSshAuth: string;
  zimaosSshKeyPath: string;
  ollamaUrl: string;
  [k: string]: string;
};

type Props = {
  settings: Config;
  setSettings: (c: Config) => void;
  onSave: () => void;
  saving: boolean;
  message: string;
};

type ProbePayload = {
  ok?: boolean;
  checks?: Record<string, { ok: boolean; detail: string }>;
};

const inputCls =
  'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition font-mono';

export default function ZimaOSTab({ settings, setSettings, onSave, saving, message }: Props) {
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<ProbePayload | null>(null);
  const [probeError, setProbeError] = useState('');

  const mode = settings.zimaosAccessMode === 'remote_ssh' ? 'remote_ssh' : 'local_docker';

  const runProbe = async () => {
    setTesting(true);
    setProbe(null);
    setProbeError('');
    try {
      const res = await fetch('/api/setup-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate',
          zimaosAccessMode: mode,
          zimaosRuntimeUrl: settings.zimaosRuntimeUrl,
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
      setTesting(false);
    }
  };

  return (
    <div class="p-6 space-y-6">
      <p class="text-xs text-gray-500">
        Onglet dédié à la communication ZimaDev ↔ ZimaOS. Choisissez le mode local Docker ou distant SSH.
      </p>

      <FormField label="Mode d’accès ZimaOS">
        <select
          class={inputCls}
          value={mode}
          onChange={(e) =>
            setSettings({
              ...settings,
              zimaosAccessMode: (e.target as HTMLSelectElement).value,
            })
          }
        >
          <option value="local_docker">Même machine (Docker local)</option>
          <option value="remote_ssh">Machine distante (SSH)</option>
        </select>
      </FormField>

      <FormField
        label="URL runtime ZimaOS"
        hint="URL joignable depuis le conteneur ZimaDev. Exemple Docker local: http://host.docker.internal:24190"
      >
        <input
          type="url"
          class={inputCls}
          value={settings.zimaosRuntimeUrl}
          onInput={(e) => setSettings({ ...settings, zimaosRuntimeUrl: (e.target as HTMLInputElement).value })}
        />
      </FormField>

      <FormField
        label="Nom du conteneur ZimaOS"
        hint="Utilisé pour les vérifications Docker et montages en mode local_docker."
      >
        <input
          type="text"
          class={inputCls}
          value={settings.zimaosContainerName}
          onInput={(e) => setSettings({ ...settings, zimaosContainerName: (e.target as HTMLInputElement).value })}
        />
      </FormField>

      {mode === 'remote_ssh' && (
        <div class="rounded-xl border border-gray-200 bg-gray-50/70 p-4 space-y-3">
          <p class="text-xs font-semibold text-gray-700">Accès distant SSH</p>
          <FormField label="Hôte ZimaOS (IP/FQDN)">
            <input
              type="text"
              class={inputCls}
              value={settings.zimaosHost}
              onInput={(e) => setSettings({ ...settings, zimaosHost: (e.target as HTMLInputElement).value })}
              placeholder="192.168.1.50"
            />
          </FormField>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Utilisateur SSH">
              <input
                type="text"
                class={inputCls}
                value={settings.zimaosSshUser}
                onInput={(e) => setSettings({ ...settings, zimaosSshUser: (e.target as HTMLInputElement).value })}
                placeholder="root"
              />
            </FormField>
            <FormField label="Port SSH">
              <input
                type="text"
                class={inputCls}
                value={settings.zimaosSshPort}
                onInput={(e) => setSettings({ ...settings, zimaosSshPort: (e.target as HTMLInputElement).value })}
                placeholder="22"
              />
            </FormField>
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FormField label="Auth SSH">
              <select
                class={inputCls}
                value={settings.zimaosSshAuth || 'key'}
                onChange={(e) => setSettings({ ...settings, zimaosSshAuth: (e.target as HTMLSelectElement).value })}
              >
                <option value="key">Clé privée</option>
                <option value="password">Mot de passe (non stocké)</option>
              </select>
            </FormField>
            <FormField label="Chemin clé SSH (si key)">
              <input
                type="text"
                class={inputCls}
                value={settings.zimaosSshKeyPath}
                onInput={(e) => setSettings({ ...settings, zimaosSshKeyPath: (e.target as HTMLInputElement).value })}
                placeholder="/run/secrets/zimadev_ssh_key"
              />
            </FormField>
          </div>
        </div>
      )}

      <div class="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={runProbe}
          class="text-sm font-medium px-4 py-2 rounded-full border border-gray-200 hover:bg-gray-50"
          disabled={testing}
        >
          {testing ? 'Diagnostic…' : 'Tester communication ZimaOS'}
        </button>
        {probeError && <span class="text-xs text-red-700">{probeError}</span>}
      </div>

      {probe?.checks && (
        <ul class="space-y-2 text-xs rounded-xl border border-gray-200 bg-white p-4">
          {Object.entries(probe.checks).map(([k, v]) => (
            <li key={k} class={v.ok ? 'text-green-700' : 'text-amber-700'}>
              <span class="font-semibold">{k}</span> - {v.detail}
            </li>
          ))}
        </ul>
      )}

      <SaveRow message={message} saving={saving} onSave={onSave} label="Sauvegarder ZimaOS" />
    </div>
  );
}
