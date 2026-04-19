import { useState, useEffect } from 'preact/hooks';
import TabBar from '../ui/TabBar';
import AccountTab from './AccountTab';
import OpenClawTab from './OpenClawTab';
import ApiTokensTab, { type CustomTokenRow } from './ApiTokensTab';
import InfraTab from './InfraTab';
import MaintenanceTab from './MaintenanceTab';
import WorkScheduleTab from './WorkScheduleTab';

type Config = {
  forgeReposRoot: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
  githubToken: string;
  vercelToken: string;
  githubWebhookSecret: string;
  openclawToken: string;
  openclawGatewayUrl: string;
  ollamaUrl: string;
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
  { id: 'schedule', label: 'Horaires de travail' },
  { id: 'maintenance', label: 'Maintenance' },
];

export default function SettingsForm() {
  const [activeTab, setActiveTab] = useState('account');
  const [settings, setSettings] = useState<Config>({
    forgeReposRoot:    '',
    dockerYamlDir:     '',
    dockerAppDataDir:  '',
    githubToken:       '',
    vercelToken:       '',
    githubWebhookSecret: '',
    openclawToken:     '',
    openclawGatewayUrl: '',
    ollamaUrl: '',
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
  const [customTokens, setCustomTokens] = useState<CustomTokenRow[]>([]);

  useEffect(() => {
    Promise.all([fetch('/api/settings'), fetch('/api/custom-api-tokens'), fetch('/api/auth/me')])
      .then(async ([settingsRes, tokensRes, meRes]) => {
        const s = await settingsRes.json();
        setSettings((prev) => ({
          ...prev,
          forgeReposRoot: s.forgeReposRoot || prev.forgeReposRoot,
          dockerYamlDir: s.dockerYamlDir || prev.dockerYamlDir,
          dockerAppDataDir: s.dockerAppDataDir || prev.dockerAppDataDir,
          githubToken: s.githubToken || '',
          vercelToken: s.vercelToken || '',
          githubWebhookSecret: s.githubWebhookSecret || '',
          openclawToken: s.openclawToken || '',
          openclawGatewayUrl:
            String(s.openclawGatewayUrl || '').trim() || prev.openclawGatewayUrl,
          ollamaUrl: typeof s.ollamaUrl === 'string' ? s.ollamaUrl : prev.ollamaUrl,
        }));
        const t = await tokensRes.json().catch(() => ({ items: [] }));
        const items = Array.isArray(t.items) ? t.items : [];
        setCustomTokens(
          items.map((i: { id: number; key: string; label?: string; hasSecret?: boolean }) => ({
            id: i.id,
            key: i.key || '',
            label: i.label || '',
            secret: '',
            hasSecret: Boolean(i.hasSecret),
          })),
        );
        const me = await meRes.json();
        if (me?.email) setAuth((a) => ({ ...a, currentEmail: me.email, newEmail: me.email }));
      })
      .finally(() => setLoading(false));
  }, []);

  const mergeSettingsFromServer = (s: Record<string, unknown>) => {
    setSettings((prev) => ({
      ...prev,
      forgeReposRoot: String(s.forgeReposRoot || prev.forgeReposRoot),
      dockerYamlDir: String(s.dockerYamlDir || prev.dockerYamlDir),
      dockerAppDataDir: String(s.dockerAppDataDir || prev.dockerAppDataDir),
      githubToken: typeof s.githubToken === 'string' ? s.githubToken : prev.githubToken,
      vercelToken: typeof s.vercelToken === 'string' ? s.vercelToken : prev.vercelToken,
      githubWebhookSecret:
        typeof s.githubWebhookSecret === 'string' ? s.githubWebhookSecret : prev.githubWebhookSecret,
      openclawToken: typeof s.openclawToken === 'string' ? s.openclawToken : prev.openclawToken,
      openclawGatewayUrl:
        String(s.openclawGatewayUrl || '').trim() || prev.openclawGatewayUrl,
      ollamaUrl: typeof s.ollamaUrl === 'string' ? s.ollamaUrl : prev.ollamaUrl,
    }));
  };

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (res.ok) {
        const s = await fetch('/api/settings').then((r) => r.json());
        mergeSettingsFromServer(s);
      }
      setMessage(res.ok ? 'Configurations sauvegardées !' : 'Erreur lors de la sauvegarde.');
    } catch {
      setMessage('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  /** Onglet Jetons API : GitHub/Vercel + jetons personnalisés. */
  const saveApiSection = async () => {
    setSaving(true);
    setMessage('');
    try {
      const resSettings = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          githubToken: settings.githubToken,
          vercelToken: settings.vercelToken,
          githubWebhookSecret: settings.githubWebhookSecret,
        }),
      });
      const resTokens = await fetch('/api/custom-api-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: customTokens.map(({ id, key, label, secret }) => ({ id, key, label, secret })),
        }),
      });
      const dataErr = await resTokens.json().catch(() => ({}));
      if (!resSettings.ok || !resTokens.ok) {
        setMessage(dataErr.error || 'Erreur lors de la sauvegarde des jetons.');
      } else {
        setMessage('Jetons enregistrés.');
        const s = await fetch('/api/settings').then((r) => r.json());
        mergeSettingsFromServer(s);
        const t = await fetch('/api/custom-api-tokens').then((r) => r.json());
        const items = Array.isArray(t.items) ? t.items : [];
        setCustomTokens(
          items.map((i: { id: number; key: string; label?: string; hasSecret?: boolean }) => ({
            id: i.id,
            key: i.key || '',
            label: i.label || '',
            secret: '',
            hasSecret: Boolean(i.hasSecret),
          })),
        );
      }
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

  if (loading) return <div class="animate-pulse text-gray-400 py-4">Chargement…</div>;

  return (
    <div class="space-y-6">
      <TabBar tabs={TABS} active={activeTab} onChange={setActiveTab} />

      <div class="bg-white border border-gray-100 rounded-[1.5rem] overflow-hidden shadow-sm min-h-[400px]">
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
            customTokens={customTokens}
            setCustomTokens={setCustomTokens}
            onSave={saveApiSection}
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
        {activeTab === 'schedule' && <WorkScheduleTab />}
        {activeTab === 'maintenance' && (
          <MaintenanceTab onSync={syncProjects} syncing={syncing} message={message} />
        )}
      </div>
    </div>
  );
}
