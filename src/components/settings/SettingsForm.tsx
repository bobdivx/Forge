import { useState, useEffect } from 'preact/hooks';
import TabBar from '../ui/TabBar';
import AccountTab from './AccountTab';
import ApiTokensTab, { type CustomTokenRow } from './ApiTokensTab';
import IntegrationTab from './IntegrationTab';
import ForgeRuntimeTab from './ForgeRuntimeTab';
import AgentModelsTab from './AgentModelsTab';
import OllamaTab from './OllamaTab';
import GeminiTab from './GeminiTab';
import MaintenanceTab from './MaintenanceTab';
import WorkScheduleTab from './WorkScheduleTab';
import AgentRulesTab from './AgentRulesTab';

type Config = {
  forgePublicUrl: string;
  zimaosContainerName: string;
  forgeReposRoot: string;
  forgeReposRootAgent: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
  githubToken: string;
  vercelToken: string;
  githubWebhookSecret: string;
  forgeApiToken: string;
  zimaosRuntimeUrl: string;
  zimaosGatewayUrl: string;
  zimaosAccessMode: string;
  zimaosHost: string;
  zimaosSshPort: string;
  zimaosSshUser: string;
  zimaosSshAuth: string;
  zimaosSshKeyPath: string;
  zimaosSshKeyContent: string;
  zimaosSshPassword: string;
  ollamaUrl: string;
  agentGlobalBuildRules: string;
  agentPreferredLanguage: string;
};

type AuthState = {
  currentEmail: string;
  newEmail: string;
  currentPassword: string;
  newPassword: string;
};

const TABS = [
  { id: 'account', label: 'Compte & Sécurité' },
  { id: 'zimaos', label: 'Infra NAS/Docker' },
  { id: 'ollama', label: 'Ollama' },
  { id: 'gemini', label: 'Gemini' },
  { id: 'integration', label: 'Docker & Chemins' },
  { id: 'api', label: 'Jetons API' },
  { id: 'models', label: 'Modèles agents' },
  { id: 'policy', label: 'Politique agents' },
  { id: 'schedule', label: 'Horaires de travail' },
  { id: 'maintenance', label: 'Maintenance' },
];

export default function SettingsForm() {
  const [activeTab, setActiveTab] = useState('account');
  const [settings, setSettings] = useState<Config>({
    forgePublicUrl: '',
    zimaosContainerName: '',
    forgeReposRoot: '',
    forgeReposRootAgent: '',
    dockerYamlDir: '',
    dockerAppDataDir: '',
    githubToken:       '',
    vercelToken:       '',
    githubWebhookSecret: '',
    forgeApiToken: '',
    zimaosRuntimeUrl: '',
    zimaosGatewayUrl: '',
    zimaosAccessMode: 'local_docker',
    zimaosHost: '',
    zimaosSshPort: '22',
    zimaosSshUser: '',
    zimaosSshAuth: 'key',
    zimaosSshKeyPath: '',
    zimaosSshKeyContent: '',
    zimaosSshPassword: '',
    ollamaUrl: '',
    agentGlobalBuildRules: '',
    agentPreferredLanguage: 'fr',
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
  const [reposHealth, setReposHealth] = useState<Record<string, unknown> | null>(null);

  const refreshReposHealth = () => {
    fetch('/api/forge-repos-health')
      .then((r) => r.json())
      .then((h) => setReposHealth(typeof h === 'object' && h ? h : null))
      .catch(() => setReposHealth(null));
  };

  useEffect(() => {
    refreshReposHealth();
  }, []);

  /** Ouvre l’onglet correspondant au hash (#schedule, #account, …). */
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const applyHash = () => {
      const h = window.location.hash.replace(/^#/, '').trim();
      if (h && TABS.some((t) => t.id === h)) setActiveTab(h);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  useEffect(() => {
    Promise.all([fetch('/api/settings'), fetch('/api/custom-api-tokens'), fetch('/api/auth/me')])
      .then(async ([settingsRes, tokensRes, meRes]) => {
        const s = await settingsRes.json();
        setSettings((prev) => ({
          ...prev,
          forgePublicUrl:
            typeof s.forgePublicUrl === 'string' ? s.forgePublicUrl : prev.forgePublicUrl,
          zimaosContainerName:
            typeof s.zimaosContainerName === 'string' ? s.zimaosContainerName : prev.zimaosContainerName,
          forgeReposRoot: s.forgeReposRoot || prev.forgeReposRoot,
          forgeReposRootAgent:
            typeof s.forgeReposRootAgent === 'string' ? s.forgeReposRootAgent : prev.forgeReposRootAgent,
          dockerYamlDir: s.dockerYamlDir || prev.dockerYamlDir,
          dockerAppDataDir: s.dockerAppDataDir || prev.dockerAppDataDir,
          githubToken: s.githubToken || '',
          vercelToken: s.vercelToken || '',
          githubWebhookSecret: s.githubWebhookSecret || '',
          forgeApiToken: s.forgeApiToken || '',
          zimaosRuntimeUrl:
            String(s.zimaosRuntimeUrl || s.zimaosGatewayUrl || '').trim() || prev.zimaosRuntimeUrl,
          zimaosAccessMode: typeof s.zimaosAccessMode === 'string' ? s.zimaosAccessMode : prev.zimaosAccessMode,
          zimaosHost: typeof s.zimaosHost === 'string' ? s.zimaosHost : prev.zimaosHost,
          zimaosSshPort: typeof s.zimaosSshPort === 'string' ? s.zimaosSshPort : prev.zimaosSshPort,
          zimaosSshUser: typeof s.zimaosSshUser === 'string' ? s.zimaosSshUser : prev.zimaosSshUser,
          zimaosSshAuth: typeof s.zimaosSshAuth === 'string' ? s.zimaosSshAuth : prev.zimaosSshAuth,
          zimaosSshKeyPath:
            typeof s.zimaosSshKeyPath === 'string' ? s.zimaosSshKeyPath : prev.zimaosSshKeyPath,
          zimaosSshKeyContent:
            typeof s.zimaosSshKeyContent === 'string' ? s.zimaosSshKeyContent : prev.zimaosSshKeyContent,
          zimaosSshPassword:
            typeof s.zimaosSshPassword === 'string' ? s.zimaosSshPassword : prev.zimaosSshPassword,
          ollamaUrl: typeof s.ollamaUrl === 'string' ? s.ollamaUrl : prev.ollamaUrl,
          agentGlobalBuildRules:
            typeof s.agentGlobalBuildRules === 'string' ? s.agentGlobalBuildRules : prev.agentGlobalBuildRules,
          agentPreferredLanguage:
            typeof s.agentPreferredLanguage === 'string' ? s.agentPreferredLanguage : prev.agentPreferredLanguage,
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
      forgePublicUrl:
        typeof s.forgePublicUrl === 'string' ? s.forgePublicUrl : prev.forgePublicUrl,
      zimaosContainerName:
        typeof s.zimaosContainerName === 'string' ? s.zimaosContainerName : prev.zimaosContainerName,
      forgeReposRoot: String(s.forgeReposRoot || prev.forgeReposRoot),
      forgeReposRootAgent:
        typeof s.forgeReposRootAgent === 'string' ? s.forgeReposRootAgent : prev.forgeReposRootAgent,
      dockerYamlDir: String(s.dockerYamlDir || prev.dockerYamlDir),
      dockerAppDataDir: String(s.dockerAppDataDir || prev.dockerAppDataDir),
      githubToken: typeof s.githubToken === 'string' ? s.githubToken : prev.githubToken,
      vercelToken: typeof s.vercelToken === 'string' ? s.vercelToken : prev.vercelToken,
      githubWebhookSecret:
        typeof s.githubWebhookSecret === 'string' ? s.githubWebhookSecret : prev.githubWebhookSecret,
      forgeApiToken: typeof s.forgeApiToken === 'string' ? s.forgeApiToken : prev.forgeApiToken,
      zimaosRuntimeUrl:
        String(s.zimaosRuntimeUrl || s.zimaosGatewayUrl || '').trim() || prev.zimaosRuntimeUrl,
      zimaosAccessMode: typeof s.zimaosAccessMode === 'string' ? s.zimaosAccessMode : prev.zimaosAccessMode,
      zimaosHost: typeof s.zimaosHost === 'string' ? s.zimaosHost : prev.zimaosHost,
      zimaosSshPort: typeof s.zimaosSshPort === 'string' ? s.zimaosSshPort : prev.zimaosSshPort,
      zimaosSshUser: typeof s.zimaosSshUser === 'string' ? s.zimaosSshUser : prev.zimaosSshUser,
      zimaosSshAuth: typeof s.zimaosSshAuth === 'string' ? s.zimaosSshAuth : prev.zimaosSshAuth,
      zimaosSshKeyPath:
        typeof s.zimaosSshKeyPath === 'string' ? s.zimaosSshKeyPath : prev.zimaosSshKeyPath,
      zimaosSshKeyContent:
        typeof s.zimaosSshKeyContent === 'string' ? s.zimaosSshKeyContent : prev.zimaosSshKeyContent,
      zimaosSshPassword:
        typeof s.zimaosSshPassword === 'string' ? s.zimaosSshPassword : prev.zimaosSshPassword,
      ollamaUrl: typeof s.ollamaUrl === 'string' ? s.ollamaUrl : prev.ollamaUrl,
      agentGlobalBuildRules:
        typeof s.agentGlobalBuildRules === 'string' ? s.agentGlobalBuildRules : prev.agentGlobalBuildRules,
      agentPreferredLanguage:
        typeof s.agentPreferredLanguage === 'string' ? s.agentPreferredLanguage : prev.agentPreferredLanguage,
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
      const payload = await res.json().catch(() => ({}));
      if (res.ok) {
        const s = await fetch('/api/settings').then((r) => r.json());
        mergeSettingsFromServer(s);
        refreshReposHealth();
      }
      setMessage(
        res.ok ? 'Configurations sauvegardées !' : typeof payload.error === 'string' ? payload.error : 'Erreur lors de la sauvegarde.',
      );
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
          forgeApiToken: settings.forgeApiToken,
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
        {activeTab === 'integration' && (
          <IntegrationTab
            settings={settings}
            setSettings={(c) => setSettings(c as unknown as Config)}
            onSave={save}
            saving={saving}
            message={message}
          />
        )}
        {activeTab === 'zimaos' && (
          <ForgeRuntimeTab
            settings={settings}
            setSettings={(c) => setSettings(c as unknown as Config)}
            onSave={save}
            saving={saving}
            message={message}
          />
        )}
        {activeTab === 'ollama' && (
          <OllamaTab />
        )}
        {activeTab === 'gemini' && (
          <GeminiTab />
        )}
        {activeTab === 'api' && (
          <ApiTokensTab
            settings={settings}
            setSettings={(c) => setSettings(c as unknown as Config)}
            customTokens={customTokens}
            setCustomTokens={setCustomTokens}
            onSave={saveApiSection}
            saving={saving}
            message={message}
          />
        )}
        {activeTab === 'models' && <AgentModelsTab />}
        {activeTab === 'policy' && <AgentRulesTab />}
        {activeTab === 'schedule' && <WorkScheduleTab />}
        {activeTab === 'maintenance' && (
          <MaintenanceTab
            onSync={syncProjects}
            syncing={syncing}
            message={message}
            settings={settings}
            reposHealth={reposHealth}
            onRefreshHealth={refreshReposHealth}
          />
        )}
      </div>
    </div>
  );
}
