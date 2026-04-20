import { useState, useEffect } from 'preact/hooks';

interface Model {
  id: string;
  name: string;
  provider: string;
}
interface Props {
  sessionKey: string;
  currentModel: string;
}

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

export default function AgentSteerForm({ sessionKey, currentModel }: Props) {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState(currentModel);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetch('/api/models')
      .then((res) => res.json())
      .then((data) => {
        if (!Array.isArray(data)) return;
        const deduped = dedupeModelsById(data);
        const hasCurrent = deduped.some((m) => m.id === currentModel);
        if (currentModel && !hasCurrent) deduped.unshift({ id: currentModel, name: currentModel, provider: 'session' });
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
        body: JSON.stringify({ sessionKey, model: selectedModel }),
      });
      const data = await res.json();
      setMessage(
        res.ok
          ? { text: 'Modèle mis à jour avec succès !', type: 'success' }
          : { text: data.error || 'Erreur lors de la mise à jour', type: 'error' },
      );
    } catch {
      setMessage({ text: 'Erreur réseau', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (fetching) {
    return (
      <div class="rounded-[1.5rem] border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div class="h-12 border-b border-gray-100 bg-gray-50/80 animate-pulse" />
        <div class="p-6 space-y-3">
          <div class="h-10 rounded-lg bg-gray-100 animate-pulse" />
          <div class="h-10 rounded-xl bg-gray-100 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div class="rounded-[1.5rem] border border-gray-100 bg-white shadow-sm overflow-hidden">
      <div class="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <svg class="w-4 h-4 shrink-0 text-[#175B37]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <h3 class="font-semibold text-gray-900 text-sm">Pilotage du modèle</h3>
      </div>
      <div class="px-6 py-5 space-y-4">
        <div>
          <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1.5">Modèle d’intelligence</label>
          <select
            class="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-white focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
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
          type="button"
          onClick={() => void handleSteer()}
          disabled={loading || selectedModel === currentModel}
          class="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#175B37] px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-95 disabled:opacity-45 disabled:cursor-not-allowed transition-opacity"
        >
          {loading ? (
            <span>Application…</span>
          ) : (
            <>
              <svg class="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Appliquer le changement
            </>
          )}
        </button>
        {message ? (
          <div
            class={
              'text-xs p-3 rounded-lg border ' +
              (message.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-red-50 border-red-200 text-red-800')
            }
          >
            {message.text}
          </div>
        ) : null}
      </div>
    </div>
  );
}
