import { useState, useEffect } from 'preact/hooks';
import TabBar from '../ui/TabBar';
import AccountTab from './AccountTab';
import OpenClawTab from './OpenClawTab';
import ApiTokensTab from './ApiTokensTab';
import InfraTab from './InfraTab';
import MaintenanceTab from './MaintenanceTab';

type Config = {
  forgeReposRoot: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
  githubToken: string;
  vercelToken: string;
  openclawToken: string;
  openclawGatewayUrl: string;
};

type AuthState = {
  currentEmail: string;
  newEmail: string;
  currentPassword: string;
  newPassword: string;
};

const TABS = [
  { id: 'account', label: 'Compte & Sécurité' },
  { id: 'openclaw', label: 'Connexion OpenClaw' },
  { id: 'api', label: 'Jetons API' },
  { id: 'infra', label: 'Infrastructure' },
  { id: 'maintenance', label: 'Maintenance' },
];

export default function SettingsForm() {
  const [activeTab, setActiveTab] = useState('account');
  const [settings, setSettings] = useState<Config>({
    forgeReposRoot:    '/media/Github',
    dockerYamlDir:     '/DATA/AppData',
    dockerAppDataDir:  '/DATA/AppData',
    githubToken:       '',
    vercelToken:       '',
    openclawToken:     '',
    openclawGatewayUrl: 'http://127.0.0.1:18789',
  });
  const [auth, setAuth] = useState<AuthState>({
    currentEmail: '',
    newEmail: '',
    currentPassword: '',
    newPassword: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [authSaving, setAuthSaving] = useState(false);
  const [authMessage, setAuthMessage] = useState('');

  useEffect(() => {
    Promise.all([fetch('/api/settings'), fetch('/api/auth/me')])
      .then(async ([settingsRes, meRes]) => {
        const s = await settingsRes.json();
        setSettings((prev) => ({
          ...prev,
          forgeReposRoot: s.forgeReposRoot || prev.forgeReposRoot,
          dockerYamlDir: s.dockerYamlDir || prev.dockerYamlDir,
          dockerAppDataDir: s.dockerAppDataDir || prev.dockerAppDataDir,
          githubToken: s.githubToken || '',
          vercelToken: s.vercelToken || '',
          openclawToken: s.openclawToken || '',
          openclawGatewayUrl:
            String(s.openclawGatewayUrl || '').trim() || prev.openclawGatewayUrl,
        }));
        const me = await meRes.json();
        if (me?.email) setAuth((a) => ({ ...a, currentEmail: me.email, newEmail: me.email }));
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      setMessage(res.ok ? 'Configurations sauvegardées !' : 'Erreur lors de la sauvegarde.');
    } catch {
      setMessage('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  const syncProjects = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync-projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forgeReposRoot: settings.forgeReposRoot }),
      });
      setMessage(res.ok ? 'Synchronisation des projets terminée !' : 'Erreur lors de la synchronisation.');
    } catch {
      setMessage('Erreur réseau.');
    } finally {
      setSyncing(false);
    }
  };

  const updateCredentials = async () => {
    setAuthSaving(true);
    setAuthMessage('');
    try {
      const res = await fetch('/api/auth/update-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: auth.currentPassword,
          newEmail: auth.newEmail,
          newPassword: auth.newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthMessage(data.error || 'Erreur lors de la mise à jour');
      } else {
        setAuthMessage('Identifiants mis à jour.');
        setAuth((a) => ({ ...a, currentEmail: a.newEmail, currentPassword: '', newPassword: '' }));
      }
    } catch {
      setAuthMessage('Erreur réseau.');
    } finally {
      setAuthSaving(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  if (loading) return <div class="animate-pulse text-slate-500 py-4">Chargement…</div>;

  return (
    <div class="space-y-6">
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-[400px]">
        {activeTab === 'account' && (
          <AccountTab
            auth={auth}
            setAuth={setAuth}
            onUpdate={updateCredentials}
            onLogout={logout}
            saving={authSaving}
            message={authMessage}
          />
        )}
        {activeTab === 'openclaw' && (
          <OpenClawTab
            settings={settings}
            setSettings={setSettings}
            onSave={save}
            saving={saving}
            message={message}
          />
        )}
        {activeTab === 'api' && (
          <ApiTokensTab
            settings={settings}
            setSettings={setSettings}
            onSave={save}
            saving={saving}
            message={message}
          />
        )}
        {activeTab === 'infra' && (
          <InfraTab
            settings={settings}
            setSettings={setSettings}
            onSave={save}
            saving={saving}
            message={message}
          />
        )}
        {activeTab === 'maintenance' && (
          <MaintenanceTab onSync={syncProjects} syncing={syncing} message={message} />
        )}
      </div>
    </div>
  );
}
