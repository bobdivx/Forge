import { useState, useEffect } from 'preact/hooks';
import FormField from '../ui/FormField';

type OllamaInstance = {
  id: number;
  name: string;
  url: string;
  apiKey?: string;
  enabled: number;
  updatedAt: string;
};

export default function OllamaTab() {
  const [instances, setInstances] = useState<OllamaInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newApiKey, setNewApiKey] = useState('');
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editApiKey, setEditApiKey] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ollama-instances');
      if (!res.ok) throw new Error('Échec du chargement');
      const data = await res.json();
      setInstances(data);
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

  return (
    <div class="p-6 space-y-8">
      <div>
        <h2 class="text-lg font-bold text-gray-900 mb-1">Instances Ollama</h2>
        <p class="text-xs text-gray-500">
          Gérez vos différents serveurs Ollama. Forge agrégera les modèles de toutes les instances actives pour votre matrice d'agents.
        </p>
      </div>

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
                        <span class={`w-2 h-2 rounded-full ${inst.enabled ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <p class="font-bold text-sm text-gray-900">{inst.name}</p>
                        {inst.apiKey && (
                          <span class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider border border-blue-100">Auth</span>
                        )}
                      </div>
                      <p class="text-xs font-mono text-gray-500">{inst.url}</p>
                    </div>
                    <div class="flex items-center gap-2">
                      <button onClick={() => toggleInstance(inst)} class={`text-[10px] font-bold px-3 py-1 rounded-full border transition-colors ${inst.enabled ? 'border-amber-200 text-amber-700 hover:bg-amber-50' : 'border-green-200 text-green-700 hover:bg-green-50'}`}>
                        {inst.enabled ? 'Désactiver' : 'Activer'}
                      </button>
                      <button onClick={() => startEdit(inst)} class="p-2 text-gray-400 hover:text-gray-600 transition-colors">
                        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => deleteInstance(inst.id)} class="p-2 text-gray-400 hover:text-red-600 transition-colors">
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
