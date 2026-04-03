import { useState, useEffect } from 'preact/hooks';

interface Model {
  id: string;
  name: string;
  provider: string;
}

interface SteerFormProps {
  sessionKey: string;
  currentModel: string;
}

/** models.list peut renvoyer le même id plusieurs fois (fournisseurs / entrées dupliquées) — une seule <option> par id. */
function dedupeModelsById(list: unknown[]): Model[] {
  const seen = new Set<string>();
  const out: Model[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    const id = typeof m.id === 'string' ? m.id : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: typeof m.name === 'string' ? m.name : id,
      provider: typeof m.provider === 'string' ? m.provider : '',
    });
  }
  return out;
}

export default function AgentSteerForm({ sessionKey, currentModel }: SteerFormProps) {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState(currentModel);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{ text: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetch('/api/models')
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const deduped = dedupeModelsById(data);
        const hasCurrent = deduped.some((m) => m.id === currentModel);
        if (currentModel && !hasCurrent) {
          deduped.unshift({
            id: currentModel,
            name: currentModel,
            provider: 'session',
          });
        }
        setModels(deduped);
      })
      .finally(() => setFetching(false));
  }, [currentModel]);

  const handleSteer = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch('/api/openclaw-steer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey, model: selectedModel })
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ text: 'Modèle mis à jour avec succès !', type: 'success' });
      } else {
        setMessage({ text: data.error || 'Erreur lors de la mise à jour', type: 'error' });
      }
    } catch (e) {
      setMessage({ text: 'Erreur réseau', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div class="animate-pulse bg-slate-800 h-10 rounded-lg"></div>;

  return (
    <div class="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <h3 class="font-bold text-white text-sm uppercase tracking-widest text-slate-500">Pilotage du Modèle</h3>

      <div class="space-y-4">
        <div class="form-control w-full">
          <label class="label pt-0">
            <span class="label-text text-[10px] uppercase font-bold text-slate-400">Modèle d'Intelligence</span>
          </label>
          <select
            class="select select-bordered select-sm w-full bg-slate-950 border-slate-700 focus:border-blue-500 text-white"
            value={selectedModel}
            onChange={(e) => setSelectedModel((e.target as HTMLSelectElement).value)}
          >
            {models.map((m, index) => (
              <option key={`${m.id}:${index}`} value={m.id}>
                {m.name}
                {m.provider ? ` (${m.provider})` : ''}
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={handleSteer}
          disabled={loading || selectedModel === currentModel}
          class={"btn btn-primary btn-sm w-full gap-2 ".concat(loading ? 'loading' : '')}
        >
          {!loading && (
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          )}
          Appliquer le changement
        </button>

        {message && (
          <div class={"text-[10px] font-medium p-2 rounded " + (message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20')}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  );
}
