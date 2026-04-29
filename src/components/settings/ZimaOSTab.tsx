import { useState } from 'preact/hooks';
import { useEffect } from 'preact/hooks';
import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type Config = {
  zimaosAccessMode: string;
  zimaosRuntimeUrl: string;
  /** Nom du conteneur Docker (Sandbox) où tournent les agents (ex: zimaos-runtime). */
  zimaosContainerName: string;
  /** URL du service Gateway sur l'hôte ZimaOS. */
  zimaosGatewayUrl: string;
  zimaosHost: string;
  zimaosSshPort: string;
  zimaosSshUser: string;
  zimaosSshAuth: string;
  zimaosSshKeyPath: string;
  zimaosSshKeyContent: string;
  zimaosSshPassword: string;
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
type SshPreflight = {
  ok?: boolean;
  platform?: string;
  tools?: { ssh?: boolean; sshpass?: boolean; plink?: boolean };
  message?: string;
};

const inputCls =
  'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition font-mono';

export default function ZimaOSTab({ settings, setSettings, onSave, saving, message }: Props) {
  const [testing, setTesting] = useState(false);
  const [probe, setProbe] = useState<ProbePayload | null>(null);
  const [probeError, setProbeError] = useState('');
  const [sshTesting, setSshTesting] = useState(false);
  const [sshResult, setSshResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [provisioningKey, setProvisioningKey] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [sshPreflight, setSshPreflight] = useState<SshPreflight | null>(null);

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

  const testSSH = async () => {
    setSshTesting(true);
    setSshResult(null);
    try {
      const res = await fetch('/api/zimaos-ssh-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zimaosHost: settings.zimaosHost,
          zimaosSshUser: settings.zimaosSshUser,
          zimaosSshPort: settings.zimaosSshPort,
          zimaosSshAuth: settings.zimaosSshAuth,
          zimaosSshKeyPath: settings.zimaosSshKeyPath,
          zimaosSshKeyContent: settings.zimaosSshKeyContent,
          zimaosSshPassword: settings.zimaosSshPassword,
        }),
      });
      const data = await res.json();
      setSshResult(data);
    } catch {
      setSshResult({ ok: false, message: 'Erreur réseau.' });
    } finally {
      setSshTesting(false);
    }
  };

  const refreshSshSettingsFromServer = async () => {
    try {
      const s = await fetch('/api/settings').then((r) => r.json());
      setSettings({
        ...settings,
        zimaosAccessMode: typeof s.zimaosAccessMode === 'string' ? s.zimaosAccessMode : settings.zimaosAccessMode,
        zimaosHost: typeof s.zimaosHost === 'string' ? s.zimaosHost : settings.zimaosHost,
        zimaosSshUser: typeof s.zimaosSshUser === 'string' ? s.zimaosSshUser : settings.zimaosSshUser,
        zimaosSshPort: typeof s.zimaosSshPort === 'string' ? s.zimaosSshPort : settings.zimaosSshPort,
        zimaosSshAuth: typeof s.zimaosSshAuth === 'string' ? s.zimaosSshAuth : settings.zimaosSshAuth,
        zimaosSshKeyPath: typeof s.zimaosSshKeyPath === 'string' ? s.zimaosSshKeyPath : settings.zimaosSshKeyPath,
        zimaosSshKeyContent:
          typeof s.zimaosSshKeyContent === 'string' ? s.zimaosSshKeyContent : settings.zimaosSshKeyContent,
        zimaosSshPassword:
          typeof s.zimaosSshPassword === 'string' ? s.zimaosSshPassword : settings.zimaosSshPassword,
      });
    } catch {
      // no-op
    }
  };

  const provisionSshKey = async () => {
    setProvisioningKey(true);
    setProvisionResult(null);
    try {
      const res = await fetch('/api/zimaos-ssh-provision-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zimaosHost: settings.zimaosHost,
          zimaosSshUser: settings.zimaosSshUser,
          zimaosSshPort: settings.zimaosSshPort,
          zimaosSshAuth: settings.zimaosSshAuth,
          zimaosSshKeyPath: settings.zimaosSshKeyPath,
          zimaosSshKeyContent: settings.zimaosSshKeyContent,
          zimaosSshPassword: settings.zimaosSshPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const ok = Boolean(data?.ok);
      setProvisionResult({
        ok,
        message: String(data?.message || (ok ? 'Clé SSH provisionnée.' : 'Provisioning impossible.')),
      });
      if (ok) {
        await refreshSshSettingsFromServer();
      }
    } catch {
      setProvisionResult({ ok: false, message: 'Erreur réseau pendant le provisioning de clé.' });
    } finally {
      setProvisioningKey(false);
    }
  };

  const rotateSshKey = async () => {
    setProvisioningKey(true);
    setProvisionResult(null);
    try {
      const res = await fetch('/api/zimaos-ssh-provision-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rotate: true,
          zimaosHost: settings.zimaosHost,
          zimaosSshUser: settings.zimaosSshUser,
          zimaosSshPort: settings.zimaosSshPort,
          zimaosSshAuth: settings.zimaosSshAuth,
          zimaosSshKeyPath: settings.zimaosSshKeyPath,
          zimaosSshKeyContent: settings.zimaosSshKeyContent,
          zimaosSshPassword: settings.zimaosSshPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      const ok = Boolean(data?.ok);
      setProvisionResult({
        ok,
        message: String(data?.message || (ok ? 'Clé SSH régénérée.' : 'Rotation impossible.')),
      });
      if (ok) {
        await refreshSshSettingsFromServer();
      }
    } catch {
      setProvisionResult({ ok: false, message: 'Erreur réseau pendant la rotation de clé.' });
    } finally {
      setProvisioningKey(false);
    }
  };

  useEffect(() => {
    if (mode !== 'remote_ssh') return;
    fetch('/api/zimaos-ssh-preflight')
      .then((r) => r.json())
      .then((data) => setSshPreflight(data))
      .catch(() => setSshPreflight(null));
  }, [mode, settings.zimaosSshAuth]);

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
        label="Nom du conteneur d’exécution (Sandbox)"
        hint="Le nom du conteneur géré par ZimaOS dans lequel les agents travaillent (ex: zimaos-runtime). Requis pour les vérifications de montages."
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
                <option value="key">Clé privée (Auto/Chemin)</option>
                <option value="password">Mot de passe</option>
              </select>
            </FormField>
            {settings.zimaosSshAuth === 'password' ? (
              <>
                <FormField label="Mot de passe SSH">
                  <input
                    type="password"
                    class={inputCls}
                    value={settings.zimaosSshPassword}
                    onInput={(e) =>
                      setSettings({ ...settings, zimaosSshPassword: (e.target as HTMLInputElement).value })
                    }
                    placeholder="••••••••"
                  />
                </FormField>
                <div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                  <p class="font-semibold">Authentification par mot de passe</p>
                  <p>
                    Le test SSH utilise désormais le transport natif Node <span class="font-mono">ssh2</span> (pas de dépendance plink/sshpass).
                  </p>
                  <p>
                    Recommandé: utiliser l’authentification par clé SSH (plus fiable et plus sécurisée).
                  </p>
                </div>
              </>
            ) : (
              <>
                <FormField label="Chemin clé SSH" hint="Si vide, Forge essaie les clés par défaut dans ~/.ssh/">
                  <input
                    type="text"
                    class={inputCls}
                    value={settings.zimaosSshKeyPath}
                    onInput={(e) => setSettings({ ...settings, zimaosSshKeyPath: (e.target as HTMLInputElement).value })}
                    placeholder="/run/secrets/zimadev_ssh_key"
                  />
                </FormField>
                <FormField label="Contenu clé privée (DB)" hint="Collez ici le contenu de votre clé ---BEGIN OPENSSH PRIVATE KEY---">
                  <textarea
                    class={`${inputCls} h-24 resize-y py-2`}
                    value={settings.zimaosSshKeyContent}
                    onInput={(e) => setSettings({ ...settings, zimaosSshKeyContent: (e.target as HTMLTextAreaElement).value })}
                    placeholder="-----BEGIN OPENSSH PRIVATE KEY----- ..."
                  />
                </FormField>
              </>
            )}
          </div>
          <div class="pt-2">
            <p class="mb-2 inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
              SSH UI v2 (provision + rotation)
            </p>
            <div class="mb-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={provisionSshKey}
                  class="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-[#175B37]/30 bg-[#175B37]/10 text-[#175B37] hover:bg-[#175B37]/15 transition-colors"
                  disabled={provisioningKey}
                >
                  {provisioningKey ? 'Provisioning clé…' : '🔐 Générer + installer une clé SSH'}
                </button>
                <button
                  type="button"
                  onClick={rotateSshKey}
                  class="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 transition-colors"
                  disabled={provisioningKey}
                >
                  {provisioningKey ? 'Rotation clé…' : '♻️ Régénérer la clé SSH'}
                </button>
                {provisionResult && (
                  <p class={`w-full text-[10px] mt-1.5 font-medium ${provisionResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                    {provisionResult.message}
                  </p>
                )}
                {settings.zimaosSshAuth !== 'password' && (
                  <p class="w-full text-[10px] text-gray-600">
                    Provisioning possible aussi en mode clé (si la clé actuelle fonctionne).
                  </p>
                )}
              </div>
            {sshPreflight?.message && (
              <p class="mb-2 text-[11px] text-gray-600">
                Préflight SSH: {sshPreflight.message}
              </p>
            )}
             <button
              type="button"
              onClick={testSSH}
              class={`text-[11px] font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                sshResult?.ok 
                  ? 'bg-green-50 border-green-200 text-green-700' 
                  : sshResult 
                    ? 'bg-red-50 border-red-200 text-red-700'
                    : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
              disabled={sshTesting}
            >
              {sshTesting ? 'Test en cours…' : '⚡ Tester la connexion SSH'}
            </button>
            {sshResult && (
              <p class={`text-[10px] mt-1.5 font-medium ${sshResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                {sshResult.message}
              </p>
            )}
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
