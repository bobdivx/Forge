import { useState, useEffect } from 'preact/hooks';
import FormField from '../ui/FormField';

type OllamaInstance = {
  id: number;
  name: string;
  url: string;
  normalizedUrl?: string;
  apiKey?: string;
  enabled: number;
  updatedAt: string;
  health?: {
    ok: boolean;
    status: number;
    endpoint: string;
    error?: string;
    models?: string[];
  } | null;
};

export default function OllamaTab() {
  const [instances, setInstances] = useState<OllamaInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [compatibility, setCompatibility] = useState<Record<string, { ok: boolean; testedAt?: string; disabledManually?: boolean }>>({});
  const [testingModel, setTestingModel] = useState<string | null>(null);
  
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [adding, setAdding] = useState(false);
  const [batchTesting, setBatchTesting] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ current: 0, total: 0, modelName: '' });
  const [fixingAgents, setFixingAgents] = useState(false);

  const runTest = async (model: string, origin: string) => {
    try {
      const res = await fetch('/api/test-ollama-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, origin }),
      });
      const data = await res.json();
      setCompatibility(prev => ({
        ...prev,
        [model]: { ok: data.ok, testedAt: new Date().toISOString() }
      }));
    } catch (e) {
      console.error(`Error testing ${model}:`, e);
    }
  };

  const toggleManualDisable = async (model: string, currentlyDisabled: boolean) => {
    try {
      const res = await fetch('/api/toggle-ollama-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, disabled: !currentlyDisabled }),
      });
      if (res.ok) {
        setCompatibility(prev => ({
          ...prev,
          [model]: { ...prev[model], disabledManually: !currentlyDisabled }
        }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const testAllModels = async () => {
    const allModels: Array<{ model: string; origin: string }> = [];
    instances.forEach(inst => {
      if (inst.enabled && inst.health?.ok && inst.health.models) {
        inst.health.models.forEach(m => {
          allModels.push({ model: m, origin: inst.normalizedUrl || inst.url });
        });
      }
    });

    if (allModels.length === 0) return;

    setBatchTesting(true);
    setBatchProgress({ current: 0, total: allModels.length, modelName: '' });

    for (let i = 0; i < allModels.length; i++) {
      const { model, origin } = allModels[i];
      setBatchProgress({ current: i + 1, total: allModels.length, modelName: model });
      await runTest(model, origin);
    }

    setBatchTesting(false);
  };

  const fixAgentModels = async () => {
    setFixingAgents(true);
    try {
      const res = await fetch('/api/fix-agent-models', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        alert(data.message);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setFixingAgents(false);
    }
  };

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editApiKey, setEditApiKey] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [instRes, compRes] = await Promise.all([
        fetch('/api/ollama-instances'),
        fetch('/api/test-ollama-model')
      ]);
      
      if (!instRes.ok) throw new Error('Échec du chargement des instances');
      const instData = await instRes.json();
      setInstances(instData);

      if (compRes.ok) {
        const compData = await compRes.json();
        setCompatibility(compData);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addInstance = async () => {
    if (!newName || !newUrl) return;
    setAdding(true);
    try {
      const res = await fetch('/api/ollama-instances', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, url: newUrl, apiKey: newApiKey }),
      });
      if (!res.ok) throw new Error('Échec de l\'ajout');
      setNewName('');
      setNewUrl('');
      setNewApiKey('');
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const startEdit = (inst: OllamaInstance) => {
    setEditingId(inst.id);
    setEditName(inst.name);
    setEditUrl(inst.url);
    setEditApiKey(inst.apiKey || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    try {
      const res = await fetch('/api/ollama-instances', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, name: editName, url: editUrl, apiKey: editApiKey }),
      });
      if (!res.ok) throw new Error('Échec de la modification');
      setEditingId(null);
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const toggleInstance = async (instance: OllamaInstance) => {
    try {
      await fetch('/api/ollama-instances', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: instance.id, enabled: instance.enabled ? 0 : 1 }),
      });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const deleteInstance = async (id: number) => {
    if (!confirm('Supprimer cette instance ?')) return;
    try {
      await fetch(`/api/ollama-instances?id=${id}`, { method: 'DELETE' });
      load();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const testModel = async (model: string, origin: string) => {
    setTestingModel(model);
    try {
      const res = await fetch('/api/test-ollama-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, origin }),
      });
      const data = await res.json();
      if (data.ok) {
        // Success
      }
      load(); // Refresh compatibility list
    } catch (e: any) {
      setError(`Erreur test ${model}: ${e.message}`);
    } finally {
      setTestingModel(null);
    }
  };

  return (
    <div class="p-6 space-y-8">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 class="text-lg font-bold text-gray-900 mb-1">Instances Ollama</h2>
          <p class="text-xs text-gray-500">
            Gérez vos différents serveurs Ollama. Forge agrégera les modèles de toutes les instances actives pour votre matrice d'agents.
          </p>
        </div>
        <div class="flex items-center justify-between gap-3 bg-gray-50 p-2 rounded-2xl border border-gray-100">
          <button
            onClick={testAllModels}
            disabled={batchTesting || instances.length === 0}
            class="px-4 py-2 rounded-full bg-gray-900 text-white text-[11px] font-bold hover:bg-black transition-all flex items-center gap-2 disabled:opacity-50"
          >
            {batchTesting ? (
              <>
                <span class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Test : {batchProgress.modelName} ({batchProgress.current}/{batchProgress.total})
              </>
            ) : (
              <>
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
                Tester tous les modèles
              </>
            )}
          </button>
          <button
            onClick={fixAgentModels}
            disabled={fixingAgents || batchTesting}
            class="px-4 py-2 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-[11px] font-bold hover:bg-amber-100 transition-all flex items-center gap-2 disabled:opacity-50"
            title="Réassigne les agents utilisant un modèle KO vers le modèle par défaut"
          >
            {fixingAgents ? (
              <span class="w-3 h-3 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
            ) : (
              <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            )}
            Corriger l'équipe
          </button>
        </div>
      </div>

      {batchTesting && (
        <div class="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mt-[-1rem]">
          <div 
            class="bg-blue-500 h-full transition-all duration-300" 
            style={{ width: `${(batchProgress.current / batchProgress.total) * 100}%` }}
          />
        </div>
      )}

      <div class="bg-gray-50 rounded-2xl border border-gray-200 p-4 space-y-4">
        <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wider">Ajouter une instance</h3>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField label="Nom">
            <input
              type="text"
              placeholder="ex: ZimaCube NAS"
              value={newName}
              onInput={(e) => setNewName((e.target as HTMLInputElement).value)}
              class="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#175B37]"
            />
          </FormField>
          <FormField label="URL (Base API)">
            <input
              type="url"
              placeholder="ex: http://10.1.0.58:38197"
              value={newUrl}
              onInput={(e) => setNewUrl((e.target as HTMLInputElement).value)}
              class="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#175B37] font-mono"
            />
          </FormField>
          <FormField label="Clé API / Token (Optionnel)">
            <input
              type="password"
              placeholder="••••••••"
              value={newApiKey}
              onInput={(e) => setNewApiKey((e.target as HTMLInputElement).value)}
              class="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#175B37] font-mono"
            />
          </FormField>
        </div>
        <button
          onClick={addInstance}
          disabled={adding || !newName || !newUrl}
          class="bg-[#175B37] text-white px-4 py-2 rounded-full text-xs font-bold hover:bg-[#0f3d25] disabled:opacity-50 transition-colors"
        >
          {adding ? 'Ajout...' : 'Ajouter l\'instance'}
        </button>
      </div>

      <div class="space-y-3">
        <h3 class="text-xs font-bold text-gray-700 uppercase tracking-wider">Vos déploiements</h3>
        {loading ? (
          <p class="text-xs text-gray-400 italic">Chargement...</p>
        ) : instances.length === 0 ? (
          <p class="text-xs text-gray-400 italic">Aucune instance configurée.</p>
        ) : (
          <div class="grid gap-3">
            {instances.map((inst) => (
              <div key={inst.id} class={`p-4 rounded-xl border transition-all ${inst.enabled ? 'bg-white border-gray-200 shadow-sm' : 'bg-gray-50 border-gray-100 opacity-60'}`}>
                {editingId === inst.id ? (
                  <div class="space-y-4">
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <FormField label="Nom">
                        <input type="text" value={editName} onInput={(e) => setEditName((e.target as HTMLInputElement).value)} class="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#175B37]" />
                      </FormField>
                      <FormField label="URL">
                        <input type="url" value={editUrl} onInput={(e) => setEditUrl((e.target as HTMLInputElement).value)} class="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#175B37] font-mono" />
                      </FormField>
                      <FormField label="Clé API">
                        <input type="password" value={editApiKey} onInput={(e) => setEditApiKey((e.target as HTMLInputElement).value)} class="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-[#175B37] font-mono" />
                      </FormField>
                    </div>
                    <div class="flex gap-2">
                      <button onClick={saveEdit} class="bg-[#175B37] text-white px-3 py-1.5 rounded-lg text-[11px] font-bold">Enregistrer</button>
                      <button onClick={() => setEditingId(null)} class="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg text-[11px] font-bold">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <div class="flex items-center justify-between">
                    <div class="space-y-1">
                      <div class="flex items-center gap-2">
                        <span
                          class={`w-2 h-2 rounded-full ${
                            !inst.enabled
                              ? 'bg-gray-300'
                              : inst.health?.ok
                                ? 'bg-green-500'
                                : 'bg-rose-500'
                          }`}
                          title={
                            !inst.enabled
                              ? 'Instance désactivée'
                              : inst.health?.ok
                                ? `Disponible (${inst.health.endpoint}, HTTP ${inst.health.status})`
                                : inst.health?.error || 'Instance indisponible'
                          }
                        />
                        <p class="font-bold text-sm text-gray-900">{inst.name}</p>
                        {inst.apiKey && (
                          <span class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider border border-blue-100">Auth</span>
                        )}
                      </div>
                      <p class="text-xs font-mono text-gray-500">{inst.normalizedUrl || inst.url}</p>
                      {inst.enabled ? (
                        <>
                          <p class={`text-[10px] ${inst.health?.ok ? 'text-emerald-700' : 'text-rose-700'}`}>
                            {inst.health?.ok
                              ? `OK via ${inst.health.endpoint} (HTTP ${inst.health.status})`
                              : inst.health?.error || 'Indisponible'}
                          </p>
                          {inst.health?.ok && inst.health.models && inst.health.models.length > 0 && (
                            <div class="flex flex-wrap gap-2 mt-3">
                              {inst.health.models.map((m) => {
                                const comp = compatibility[m];
                                const isTesting = batchTesting && batchProgress.modelName === m;
                                const isDisabled = comp?.disabledManually;

                                return (
                                  <div key={m} class={`flex items-center gap-1.5 p-1.5 rounded-lg border transition-all ${isDisabled ? 'bg-gray-100 border-gray-200 opacity-50' : 'bg-gray-50 border-gray-200'}`}>
                                    <span class={`text-[10px] font-mono font-bold ${isDisabled ? 'text-gray-400 line-through' : 'text-gray-700'}`}>{m}</span>
                                    
                                    {comp && !isDisabled && (
                                      <span 
                                        class={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${comp.ok ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}
                                        title={comp.testedAt ? `Testé le ${new Date(comp.testedAt).toLocaleString()}` : ''}
                                      >
                                        {comp.ok ? 'Forge OK' : 'Forge KO'}
                                      </span>
                                    )}

                                    {isDisabled && (
                                      <span class="px-1.5 py-0.5 rounded bg-gray-200 text-gray-500 text-[9px] font-bold uppercase">Désactivé</span>
                                    )}

                                    <div class="flex items-center gap-1 ml-1">
                                      <button 
                                        onClick={() => runTest(m, inst.normalizedUrl || inst.url)}
                                        disabled={isTesting || batchTesting}
                                        class={`p-1 rounded hover:bg-gray-200 transition-colors ${isTesting ? 'animate-spin text-blue-500' : 'text-gray-400'}`}
                                        title="Lancer un test"
                                      >
                                        <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                        </svg>
                                      </button>
                                      <button 
                                        onClick={() => toggleManualDisable(m, !!isDisabled)}
                                        class={`p-1 rounded transition-colors ${isDisabled ? 'text-emerald-500 hover:bg-emerald-50' : 'text-gray-300 hover:text-rose-500 hover:bg-rose-50'}`}
                                        title={isDisabled ? 'Activer le modèle' : 'Désactiver le modèle'}
                                      >
                                        {isDisabled ? (
                                          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7" /></svg>
                                        ) : (
                                          <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                                        )}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </>
                      ) : (
                        <p class="text-[10px] text-gray-500">Instance désactivée</p>
                      )}
                    </div>
                    <div class="flex items-center gap-2">
                      <button onClick={() => toggleInstance(inst)} class={`text-[10px] font-bold px-3 py-1 rounded-full border transition-colors ${inst.enabled ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-green-200 text-green-700 hover:bg-green-50'}`}>
                        {inst.enabled ? 'Désactiver' : 'Activer'}
                      </button>
                      <button onClick={() => startEdit(inst)} class="p-2 text-gray-400 hover:text-gray-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded" aria-label={`Modifier l'instance ${inst.name}`} title="Modifier l'instance">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => deleteInstance(inst.id)} class="p-2 text-gray-400 hover:text-red-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded" aria-label={`Supprimer l'instance ${inst.name}`} title="Supprimer l'instance">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div class="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg">
          {error}
        </div>
      )}
    </div>
  );
}
