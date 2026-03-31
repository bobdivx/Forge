import { useState, useEffect } from 'preact/hooks';

export default function SettingsForm() {
  const [settings, setSettings] = useState({
    githubToken: '',
    vercelToken: '',
    userName: 'Mathieu',
    userRole: 'Chef de Forge',
    notificationsEnabled: true
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (Object.keys(data).length > 0) {
          setSettings(prev => ({ ...prev, ...data }));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
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

  if (loading) return <div class="animate-pulse text-slate-500">Chargement...</div>;

  return (
    <div class="space-y-8">
      {/* Profil Section */}
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div class="p-6 border-b border-slate-800">
          <h3 class="font-semibold text-white mb-4">Profil Utilisateur</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Nom complet</label>
              <input 
                type="text" 
                value={settings.userName} 
                onInput={(e) => setSettings({...settings, userName: (e.target as HTMLInputElement).value})}
                class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition" 
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Rôle</label>
              <input 
                type="text" 
                value={settings.userRole} 
                onInput={(e) => setSettings({...settings, userRole: (e.target as HTMLInputElement).value})}
                class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition" 
              />
            </div>
          </div>
        </div>
      </div>

      {/* API Tokens Section */}
      <div class="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div class="p-6">
          <h3 class="font-semibold text-white mb-1">Jetons d'accès (API)</h3>
          <p class="text-xs text-slate-400 mb-6">Nécessaire pour que les agents puissent déployer et synchroniser le code.</p>
          
          <div class="space-y-4">
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">GitHub Personal Access Token</label>
              <input 
                type="password" 
                placeholder="ghp_xxxxxxxxxxxx"
                value={settings.githubToken} 
                onInput={(e) => setSettings({...settings, githubToken: (e.target as HTMLInputElement).value})}
                class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono" 
              />
            </div>
            <div>
              <label class="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Vercel Access Token</label>
              <input 
                type="password" 
                placeholder="Bearer xxxxxxxxxxxx"
                value={settings.vercelToken} 
                onInput={(e) => setSettings({...settings, vercelToken: (e.target as HTMLInputElement).value})}
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
