import { useEffect, useState } from 'preact/hooks';

type RoutineConfig = {
  routineEnabled: string;
  routineIntervalMinutes: string;
  routineGithubRoot: string;
  routineWatchAgentId: string;
  routineImproveAgentId: string;
};

const DEFAULT_CONFIG: RoutineConfig = {
  routineEnabled: 'false',
  routineIntervalMinutes: '60',
  routineGithubRoot: '',
  routineWatchAgentId: 'MAINTENANCE_REPO',
  routineImproveAgentId: 'VEILLE_TECH',
};

export default function RoutinePanel() {
  const [config, setConfig] = useState<RoutineConfig>(DEFAULT_CONFIG);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('/api/routine')
      .then((r) => r.json())
      .then((data) => {
        setConfig((prev) => ({ ...prev, ...data }));
      })
      .catch(() => {
        setMessage('Impossible de charger la routine.');
      })
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/routine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || 'Erreur de sauvegarde.');
      } else {
        setConfig((prev) => ({ ...prev, ...(data.config || {}) }));
        setMessage('Routine sauvegardée.');
      }
    } catch {
      setMessage('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  const runNow = async () => {
    setRunning(true);
    setMessage('');
    try {
      const res = await fetch('/api/routine-run', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || 'Échec du lancement manuel.');
      } else {
        setMessage('Routine lancée: mission envoyée aux agents de surveillance et d’amélioration.');
      }
    } catch {
      setMessage('Erreur réseau.');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <div class="animate-pulse text-gray-400">Chargement de la routine…</div>;
  }

  const enabled = config.routineEnabled === 'true';

  return (
    <div class="bg-white border border-gray-100 rounded-[1.5rem] shadow-sm p-6 space-y-6">
      <div>
        <h2 class="text-xl font-semibold text-gray-900">Routine Forge</h2>
        <p class="text-sm text-gray-500 mt-1">
          Configure un pilotage centralisé des routines agents sans hardcoder les chemins.
        </p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label class="space-y-1.5 md:col-span-2">
          <span class="text-xs font-semibold text-gray-500 uppercase tracking-widest">Répertoire GitHub à surveiller</span>
          <input
            value={config.routineGithubRoot}
            onInput={(e) => setConfig((p) => ({ ...p, routineGithubRoot: (e.target as HTMLInputElement).value }))}
            placeholder="Ex: D:\Github ou /mnt/GitHub"
            class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>

        <label class="space-y-1.5">
          <span class="text-xs font-semibold text-gray-500 uppercase tracking-widest">Agent surveillance</span>
          <input
            value={config.routineWatchAgentId}
            onInput={(e) => setConfig((p) => ({ ...p, routineWatchAgentId: (e.target as HTMLInputElement).value }))}
            class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>

        <label class="space-y-1.5">
          <span class="text-xs font-semibold text-gray-500 uppercase tracking-widest">Agent améliorations (vTech)</span>
          <input
            value={config.routineImproveAgentId}
            onInput={(e) => setConfig((p) => ({ ...p, routineImproveAgentId: (e.target as HTMLInputElement).value }))}
            class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>

        <label class="space-y-1.5">
          <span class="text-xs font-semibold text-gray-500 uppercase tracking-widest">Intervalle (minutes)</span>
          <input
            type="number"
            min={5}
            max={1440}
            value={config.routineIntervalMinutes}
            onInput={(e) => setConfig((p) => ({ ...p, routineIntervalMinutes: (e.target as HTMLInputElement).value }))}
            class="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </label>

        <label class="flex items-center gap-3 mt-6">
          <button
            type="button"
            onClick={() =>
              setConfig((p) => ({ ...p, routineEnabled: p.routineEnabled === 'true' ? 'false' : 'true' }))
            }
            class={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
              enabled ? 'bg-emerald-500' : 'bg-gray-300'
            }`}
          >
            <span
              class={`inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform duration-200 ${
                enabled ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
          <span class="text-sm text-gray-700 font-medium">
            {enabled ? 'Routine activée' : 'Routine désactivée'}
          </span>
        </label>
      </div>

      <div class="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          class="px-4 py-2 rounded-full text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          style="background:#175B37"
        >
          {saving ? 'Sauvegarde…' : 'Sauvegarder la routine'}
        </button>
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          class="px-4 py-2 rounded-full text-sm font-medium border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {running ? 'Lancement…' : 'Lancer maintenant'}
        </button>
      </div>

      {message && (
        <p class={`text-sm font-medium ${message.toLowerCase().includes('erreur') || message.toLowerCase().includes('échec') ? 'text-red-500' : 'text-emerald-600'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
