import { useState, useEffect } from 'preact/hooks';

export default function SettingsForm() {
  const [activeTab, setActiveTab] = useState('account');
  const [settings, setSettings] = useState({
    githubToken: '',
    vercelToken: '',
    openclawToken: '',
    openclawGatewayUrl: '',
    forgeReposRoot: '/mnt/GitHub',
    dockerYamlDir: '/mnt/Docker/yaml',
    dockerAppDataDir: '/mnt/Docker/AppData',
  });
  const [auth, setAuth] = useState({
    currentEmail: '',
    newEmail: '',
    currentPassword: '',
    newPassword: ''
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
        const settingsData = await settingsRes.json();
        const meData = await meRes.json();
        if (Object.keys(settingsData).length > 0) {
          setSettings(prev => ({ ...prev, ...settingsData }));
        }
        if (meData?.email) {
          setAuth(prev => ({ ...prev, currentEmail: meData.email, newEmail: meData.email }));
        }
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
      if (res.ok) {
        setMessage('Configurations sauvegardées !');
      } else {
        setMessage('Erreur lors de la sauvegarde.');
      }
    } catch (err) {
      setMessage('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  const syncProjects = async () => {
    setSyncing(true);
    try {
      const res = await fetch('/api/sync-projects', { method: 'POST' });
      if (res.ok) {
        setMessage('Synchronisation des projets terminée !');
      } else {
        setMessage('Erreur lors de la synchronisation.');
      }
    } catch (err) {
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
          newPassword: auth.newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthMessage(data.error || 'Erreur lors de la mise à jour');
      } else {
        setAuthMessage('Identifiants mis à jour.');
        setAuth((prev) => ({
          ...prev,
          currentEmail: prev.newEmail,
          currentPassword: '',
          newPassword: ''
        }));
      }
    } catch (err) {
      setAuthMessage('Erreur réseau.');
    } finally {
      setAuthSaving(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  };

  if (loading) return <div class="animate-pulse text-slate-500">Chargement...</div>;

  return (
    <div class="space-y-6">
      {/* Menu Onglets */}
      <div class="flex gap-1 p-1 bg-slate-900 border border-slate-800 rounded-lg w-fit">
        <button 
          onClick={() => setActiveTab('account')}
          class={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'account' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          Compte & Sécurité
        </button>
        <button 
          onClick={() => setActiveTab('openclaw')}
          class={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'openclaw' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          Connexion OpenClaw
        </button>
        <button 
          onClick={() => setActiveTab('api')}
          class={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'api' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          Jetons API
        </button>
        <button 
          onClick={() => setActiveTab('infra')}
          class={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'infra' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          Infrastructure
        </button>
        <button 
          onClick={() => setActiveTab('maintenance')}
          class={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === 'maintenance' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
        >
          Maintenance
        </button>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl min-h-[400px]">
        {/* COMPTE & SECURITE */}
        {activeTab === 'account' && (
          <div class="p-6 space-y-6 animate-in fade-in duration-300">
            <div>
              <h3 class="font-semibold text-white mb-1">Compte utilisateur</h3>
              <p class="text-xs text-slate-400 mb-6">Gérez vos identifiants d'accès au dashboard Forge.</p>
              
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Email actuel</label>
                  <input 
                    type="email" 
                    value={auth.currentEmail}
                    disabled
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-400 cursor-not-allowed opacity-60" 
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Nouvel email</label>
                  <input 
                    type="email" 
                    value={auth.newEmail} 
                    onInput={(e) => setAuth({...auth, newEmail: (e.target as HTMLInputElement).value})}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition" 
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Mot de passe actuel</label>
                  <input 
                    type="password" 
                    value={auth.currentPassword} 
                    onInput={(e) => setAuth({...auth, currentPassword: (e.target as HTMLInputElement).value})}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition" 
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Nouveau mot de passe</label>
                  <input 
                    type="password" 
                    value={auth.newPassword} 
                    onInput={(e) => setAuth({...auth, newPassword: (e.target as HTMLInputElement).value})}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition" 
                  />
                </div>
              </div>
            </div>

            <div class="pt-4 flex items-center justify-between border-t border-slate-800">
              <span class={`text-sm ${authMessage.includes('Erreur') ? 'text-red-400' : 'text-emerald-400'}`}>{authMessage}</span>
              <div class="flex gap-2">
                <button onClick={logout} class="btn btn-ghost border border-slate-700 text-xs h-9 min-h-0">Déconnexion</button>
                <button
                  onClick={updateCredentials}
                  disabled={authSaving || !auth.currentPassword || !auth.newPassword || !auth.newEmail}
                  class={`btn btn-primary text-xs h-9 min-h-0 ${authSaving ? 'loading' : ''}`}
                >
                  Mettre à jour les identifiants
                </button>
              </div>
            </div>
          </div>
        )}

        {/* OPENCLAW GATEWAY */}
        {activeTab === 'openclaw' && (
          <div class="p-6 space-y-6 animate-in fade-in duration-300">
            <div>
              <h3 class="font-semibold text-white mb-1">Connexion OpenClaw Gateway</h3>
              <p class="text-xs text-slate-400 mb-6">Configurez la liaison entre ce dashboard et votre instance OpenClaw.</p>
              
              <div class="space-y-4">
                <div>
                  <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">URL du gateway</label>
                  <input
                    type="url"
                    placeholder="http://127.0.0.1:18789"
                    value={settings.openclawGatewayUrl}
                    onInput={(e) => setSettings({ ...settings, openclawGatewayUrl: (e.target as HTMLInputElement).value })}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono"
                  />
                  <p class="text-[10px] text-slate-500 mt-1">
                    C'est l'adresse où OpenClaw écoute (défaut: 18789).
                  </p>
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Token d'accès (Gateway Token)</label>
                  <input 
                    type="password" 
                    placeholder="Token défini dans openclaw.json"
                    value={settings.openclawToken} 
                    onInput={(e) => setSettings({...settings, openclawToken: (e.target as HTMLInputElement).value})}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono" 
                  />
                </div>
              </div>
            </div>

            <div class="pt-4 flex items-center justify-between border-t border-slate-800">
              <span class={`text-sm ${message.includes('Erreur') ? 'text-red-400' : 'text-emerald-400'}`}>{message}</span>
              <button onClick={save} disabled={saving} class={`btn btn-primary text-xs h-9 min-h-0 ${saving ? 'loading' : ''}`}>
                Sauvegarder la connexion
              </button>
            </div>
          </div>
        )}

        {/* INFRASTRUCTURE */}
        {activeTab === 'infra' && (
          <div class="p-6 space-y-6 animate-in fade-in duration-300">
            <div>
              <h3 class="font-semibold text-white mb-1">Configuration des Chemins NAS</h3>
              <p class="text-xs text-slate-400 mb-6">Définissez les dossiers racines pour les dépôts et les données Docker (recommandé: /mnt/).</p>
              
              <div class="space-y-4">
                <div>
                  <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Racine des Dépôts GitHub</label>
                  <input 
                    type="text" 
                    value={settings.forgeReposRoot} 
                    onInput={(e) => setSettings({...settings, forgeReposRoot: (e.target as HTMLInputElement).value})}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono" 
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Dossier Docker YAML</label>
                  <input 
                    type="text" 
                    value={settings.dockerYamlDir} 
                    onInput={(e) => setSettings({...settings, dockerYamlDir: (e.target as HTMLInputElement).value})}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono" 
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Dossier AppData Docker</label>
                  <input 
                    type="text" 
                    value={settings.dockerAppDataDir} 
                    onInput={(e) => setSettings({...settings, dockerAppDataDir: (e.target as HTMLInputElement).value})}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono" 
                  />
                </div>
              </div>
            </div>

            <div class="pt-4 flex items-center justify-between border-t border-slate-800">
              <span class={`text-sm ${message.includes('Erreur') ? 'text-red-400' : 'text-emerald-400'}`}>{message}</span>
              <button onClick={save} disabled={saving} class={`btn btn-primary text-xs h-9 min-h-0 ${saving ? 'loading' : ''}`}>
                Sauvegarder les chemins
              </button>
            </div>
          </div>
        )}

        {/* JETONS API */}
        {activeTab === 'api' && (
          <div class="p-6 space-y-6 animate-in fade-in duration-300">
            <div>
              <h3 class="font-semibold text-white mb-1">Jetons d'accès (Déploiement)</h3>
              <p class="text-xs text-slate-400 mb-6">Utilisés par les agents pour automatiser vos déploiements GitHub et Vercel.</p>
              
              <div class="space-y-4">
                <div>
                  <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">GitHub (PAT)</label>
                  <input 
                    type="password" 
                    placeholder="ghp_xxxxxxxxxxxx"
                    value={settings.githubToken} 
                    onInput={(e) => setSettings({...settings, githubToken: (e.target as HTMLInputElement).value})}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono" 
                  />
                </div>
                <div>
                  <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Vercel Token</label>
                  <input 
                    type="password" 
                    placeholder="xxxxxxxxxxxx"
                    value={settings.vercelToken} 
                    onInput={(e) => setSettings({...settings, vercelToken: (e.target as HTMLInputElement).value})}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono" 
                  />
                </div>
              </div>
            </div>

            <div class="pt-4 flex items-center justify-between border-t border-slate-800">
              <span class={`text-sm ${message.includes('Erreur') ? 'text-red-400' : 'text-emerald-400'}`}>{message}</span>
              <button onClick={save} disabled={saving} class={`btn btn-primary text-xs h-9 min-h-0 ${saving ? 'loading' : ''}`}>
                Sauvegarder les jetons
              </button>
            </div>
          </div>
        )}

        {/* MAINTENANCE */}
        {activeTab === 'maintenance' && (
          <div class="p-6 space-y-6 animate-in fade-in duration-300">
            <div>
              <h3 class="font-semibold text-white mb-1">Outils de maintenance</h3>
              <p class="text-xs text-slate-400 mb-6">Actions pour resynchroniser les données physiques avec la base logicielle.</p>
              
              <div class="bg-slate-950 border border-slate-800 rounded-lg p-4 flex items-center justify-between">
                <div>
                  <h4 class="text-sm font-medium text-white">Synchronisation des Projets</h4>
                  <p class="text-[10px] text-slate-500 mt-1">Recherche les dépôts dans le dossier configuré et les ajoute à Astro DB.</p>
                </div>
                <button 
                  onClick={syncProjects}
                  disabled={syncing}
                  class={`btn btn-outline btn-sm ${syncing ? 'loading' : ''}`}
                >
                  {syncing ? 'Synchronisation...' : 'Lancer la Sync'}
                </button>
              </div>
            </div>

            <div class="pt-4 border-t border-slate-800">
              <span class={`text-sm ${message.includes('Erreur') ? 'text-red-400' : 'text-emerald-400'}`}>{message}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
