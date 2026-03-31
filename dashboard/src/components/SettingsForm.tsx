import { useState, useEffect } from 'preact/hooks';

export default function SettingsForm() {
  const [settings, setSettings] = useState({
    githubToken: '',
    vercelToken: '',
    openclawToken: ''
  });
  const [auth, setAuth] = useState({
    currentEmail: '',
    newEmail: '',
    currentPassword: '',
    newPassword: ''
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
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
        setAuthMessage(data.error || 'Erreur lors de la mise a jour');
      } else {
        setAuthMessage('Identifiants mis a jour.');
        setAuth((prev) => ({
          ...prev,
          currentEmail: prev.newEmail,
          currentPassword: '',
          newPassword: ''
        }));
      }
    } catch (err) {
      setAuthMessage('Erreur reseau.');
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
    <div class="space-y-8">
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div class="p-6 border-b border-slate-800">
          <h3 class="font-semibold text-white mb-4">Compte utilisateur</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Email actuel</label>
              <input 
                id="current-email"
                name="currentEmail"
                type="email" 
                autoComplete="email"
                value={auth.currentEmail}
                disabled
                class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-400" 
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Nouvel email</label>
              <input 
                id="new-email"
                name="newEmail"
                type="email" 
                autoComplete="email"
                value={auth.newEmail} 
                onInput={(e) => setAuth({...auth, newEmail: (e.target as HTMLInputElement).value})}
                class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition" 
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Mot de passe actuel</label>
              <input 
                id="current-password"
                name="currentPassword"
                type="password" 
                autoComplete="current-password"
                value={auth.currentPassword} 
                onInput={(e) => setAuth({...auth, currentPassword: (e.target as HTMLInputElement).value})}
                class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition" 
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Nouveau mot de passe</label>
              <input 
                id="new-password"
                name="newPassword"
                type="password" 
                autoComplete="new-password"
                value={auth.newPassword} 
                onInput={(e) => setAuth({...auth, newPassword: (e.target as HTMLInputElement).value})}
                class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition" 
              />
            </div>
          </div>
          <div class="mt-4 flex items-center justify-between">
            <span class={`text-sm ${authMessage.includes('Erreur') || authMessage.includes('invalide') ? 'text-red-400' : 'text-emerald-400'}`}>{authMessage}</span>
            <div class="flex gap-2">
              <button
                onClick={logout}
                class="btn btn-ghost border border-slate-700"
              >
                Deconnexion
              </button>
              <button
                onClick={updateCredentials}
                disabled={authSaving || !auth.currentPassword || !auth.newPassword || !auth.newEmail}
                class={`btn btn-primary ${authSaving ? 'loading' : ''}`}
              >
                {authSaving ? 'Mise a jour...' : 'Mettre a jour les identifiants'}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div class="p-6">
          <h3 class="font-semibold text-white mb-1">Jetons d'acces (API)</h3>
          <p class="text-xs text-slate-400 mb-6">Nécessaire pour que les agents puissent déployer et synchroniser le code.</p>
          
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">GitHub Personal Access Token</label>
              <input 
                id="github-token"
                name="githubToken"
                type="password" 
                autoComplete="off"
                placeholder="ghp_xxxxxxxxxxxx"
                value={settings.githubToken} 
                onInput={(e) => setSettings({...settings, githubToken: (e.target as HTMLInputElement).value})}
                class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono" 
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Vercel Access Token</label>
              <input 
                id="vercel-token"
                name="vercelToken"
                type="password" 
                autoComplete="off"
                placeholder="Bearer xxxxxxxxxxxx"
                value={settings.vercelToken} 
                onInput={(e) => setSettings({...settings, vercelToken: (e.target as HTMLInputElement).value})}
                class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono" 
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Token Forge ↔ OpenClaw</label>
              <input 
                id="openclaw-token"
                name="openclawToken"
                type="password" 
                autoComplete="off"
                placeholder="Token de liaison OpenClaw"
                value={settings.openclawToken} 
                onInput={(e) => setSettings({...settings, openclawToken: (e.target as HTMLInputElement).value})}
                class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono" 
              />
            </div>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between">
        <span class={`text-sm ${message.includes('Erreur') ? 'text-red-400' : 'text-emerald-400'}`}>{message}</span>
        <button 
          onClick={save}
          disabled={saving}
          class={`btn btn-primary px-8 ${saving ? 'loading' : ''}`}
        >
          {saving ? 'Sauvegarde...' : 'Sauvegarder les réglages'}
        </button>
      </div>
    </div>
  );
}
