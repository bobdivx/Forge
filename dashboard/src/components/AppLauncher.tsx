import { useState } from 'preact/hooks';

export default function AppLauncher() {
  const [name, setName] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);

  const createApp = async () => {
    if (!name.trim()) {
      setStatus('Nom invalide');
      return;
    }
    setLoading(true);
    setStatus('Création en cours...');
    try {
      const res = await fetch('/api/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus(data.error || 'Erreur lors de la création');
      } else {
        setStatus(`Ordre envoyé ! L'agent CHEF_TECHNIQUE s'occupe de ${data.app}.`);
        setName('');
      }
    } catch (err) {
      setStatus('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="relative z-10 flex flex-col h-full">
      <div class="flex items-center gap-2 mb-4">
        <svg class="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h3 class="font-bold text-white tracking-tight">Nouvelle Application</h3>
      </div>
      <p class="text-sm text-slate-400 mb-6">
        Lancez un ordre à l'essaim pour générer, configurer et déployer une nouvelle app ZimaOS.
      </p>
      
      <div class="mt-auto">
        <div class="relative flex items-center mb-3">
          <div class="absolute left-3 text-slate-500">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <input
            type="text"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
            placeholder="Nom de l'application..."
            class="w-full bg-slate-950/50 border border-slate-700/50 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 pl-9 pr-3 py-2.5 rounded-lg text-sm transition outline-none"
            disabled={loading}
          />
        </div>
        <button 
          onClick={createApp} 
          disabled={loading || !name.trim()}
          class={`w-full py-2.5 rounded-lg font-semibold text-sm transition shadow-lg flex items-center justify-center gap-2
            ${loading || !name.trim() ? 'bg-slate-800 text-slate-500 cursor-not-allowed shadow-none border border-slate-700' : 'bg-blue-600 text-white hover:bg-blue-500 shadow-blue-500/20'}`}
        >
          {loading ? (
            <span class="flex items-center gap-2">
              <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Lancement...
            </span>
          ) : (
             <>
               <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
               </svg>
               LANCER LA FORGE
             </>
          )}
        </button>
        {status && (
          <div class={`text-xs mt-4 p-3 rounded bg-slate-950/50 border ${status.includes('Erreur') ? 'border-red-500/30 text-red-400' : 'border-blue-500/30 text-blue-400'}`}>
            <div class="flex items-start gap-2">
              <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>{status}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
