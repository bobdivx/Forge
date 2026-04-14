import { useState, useEffect } from 'preact/hooks';

interface AgentRow {
  agentId: string;
  model: string;
  filePath: string;
  systemPrompt: string;
  enabled: number;
  updatedAt: string;
}

interface SyncStatus {
  agentId: string;
  model: string;
  filePath: string;
  enabled: boolean;
  fileExists: boolean;
  updatedAt: string;
}

const MODEL_OPTIONS = [
  'qwen2.5:32b',
  'qwen2.5-coder:7b',
  'llama3.1:8b',
  'mistral:7b',
  'deepseek-coder:6.7b',
];

export default function AgentInstructionEditor() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus[]>([]);
  const [selected, setSelected] = useState<AgentRow | null>(null);
  const [draft, setDraft] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [tab, setTab] = useState<'edit' | 'status'>('edit');

  useEffect(() => {
    fetchAgents();
    fetchSyncStatus();
  }, []);

  async function fetchAgents() {
    const r = await fetch('/api/agent-instructions');
    const data: AgentRow[] = await r.json();
    setAgents(data.sort((a, b) => a.agentId.localeCompare(b.agentId)));
  }

  async function fetchSyncStatus() {
    const r = await fetch('/api/sync-agents');
    const data: SyncStatus[] = await r.json();
    setSyncStatus(data);
  }

  function selectAgent(agent: AgentRow) {
    setSelected(agent);
    setDraft(agent.systemPrompt);
    setDraftModel(agent.model);
    setMsg(null);
  }

  async function save() {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch('/api/agent-instructions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selected.agentId, systemPrompt: draft, model: draftModel }),
      });
      const data = await r.json();
      if (data.ok) {
        setMsg({ type: 'ok', text: 'Sauvegardé en DB.' });
        await fetchAgents();
        const updated = agents.find(a => a.agentId === selected.agentId);
        if (updated) setSelected({ ...updated, systemPrompt: draft, model: draftModel });
      } else {
        setMsg({ type: 'err', text: data.error ?? 'Erreur inconnue' });
      }
    } catch {
      setMsg({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setSaving(false);
    }
  }

  async function syncOne() {
    if (!selected) return;
    setSyncing(true);
    setMsg(null);
    try {
      const r = await fetch('/api/sync-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selected.agentId }),
      });
      const data = await r.json();
      if (data.ok && data.synced?.length) {
        setMsg({ type: 'ok', text: `Fichier .md régénéré : ${selected.filePath}` });
        fetchSyncStatus();
      } else {
        setMsg({ type: 'err', text: data.errors?.[0]?.error ?? 'Sync échoué' });
      }
    } catch {
      setMsg({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setSyncing(false);
    }
  }

  async function syncAll() {
    setSyncing(true);
    setMsg(null);
    try {
      const r = await fetch('/api/sync-agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      const data = await r.json();
      setMsg({ type: 'ok', text: `${data.synced?.length ?? 0} fichiers régénérés${data.errors?.length ? ` (${data.errors.length} erreurs)` : ''}` });
      fetchSyncStatus();
    } catch {
      setMsg({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setSyncing(false);
    }
  }

  const isDirty = selected && (draft !== selected.systemPrompt || draftModel !== selected.model);

  const fileStatus = selected
    ? syncStatus.find(s => s.agentId === selected.agentId)
    : null;

  return (
    <div class="flex flex-col gap-4">
      {/* Tabs */}
      <div class="flex gap-2 border-b border-zinc-700 pb-2">
        <button
          onClick={() => setTab('edit')}
          class={`px-4 py-1.5 rounded-t text-sm font-medium transition-colors ${tab === 'edit' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
        >
          Éditeur
        </button>
        <button
          onClick={() => setTab('status')}
          class={`px-4 py-1.5 rounded-t text-sm font-medium transition-colors ${tab === 'status' ? 'bg-zinc-700 text-white' : 'text-zinc-400 hover:text-white'}`}
        >
          Statut fichiers
        </button>
        <div class="ml-auto">
          <button
            onClick={syncAll}
            disabled={syncing}
            class="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded transition-colors"
          >
            {syncing ? '⏳ Sync…' : '⚡ Sync tous les agents →  .md'}
          </button>
        </div>
      </div>

      {tab === 'edit' && (
        <div class="grid grid-cols-[220px_1fr] gap-4 min-h-[600px]">
          {/* Liste agents */}
          <div class="flex flex-col gap-1 border border-zinc-700 rounded-lg p-2 bg-zinc-900 overflow-y-auto max-h-[640px]">
            {agents.map(agent => {
              const status = syncStatus.find(s => s.agentId === agent.agentId);
              return (
                <button
                  key={agent.agentId}
                  onClick={() => selectAgent(agent)}
                  class={`flex flex-col items-start px-3 py-2 rounded text-left text-sm transition-colors ${
                    selected?.agentId === agent.agentId
                      ? 'bg-blue-600 text-white'
                      : 'hover:bg-zinc-700 text-zinc-300'
                  }`}
                >
                  <span class="font-mono font-semibold text-xs truncate w-full">{agent.agentId}</span>
                  <span class="text-[10px] opacity-60 truncate w-full">{agent.model}</span>
                  {status && !status.fileExists && (
                    <span class="text-[10px] text-yellow-400">⚠ fichier absent</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Éditeur */}
          <div class="flex flex-col gap-3">
            {selected ? (
              <>
                {/* Header */}
                <div class="flex items-center gap-3 flex-wrap">
                  <h3 class="text-base font-bold font-mono text-white">{selected.agentId}</h3>
                  <select
                    value={draftModel}
                    onChange={e => setDraftModel((e.target as HTMLSelectElement).value)}
                    class="text-xs bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-zinc-200"
                  >
                    {MODEL_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                  <span class="text-[10px] text-zinc-500 font-mono ml-auto">{selected.filePath}</span>
                  {fileStatus && (
                    <span class={`text-[10px] px-2 py-0.5 rounded ${fileStatus.fileExists ? 'bg-green-900 text-green-300' : 'bg-yellow-900 text-yellow-300'}`}>
                      {fileStatus.fileExists ? '✓ fichier OK' : '⚠ fichier absent'}
                    </span>
                  )}
                </div>

                {/* Textarea */}
                <textarea
                  value={draft}
                  onInput={e => setDraft((e.target as HTMLTextAreaElement).value)}
                  class="flex-1 min-h-[460px] bg-zinc-950 border border-zinc-700 rounded-lg p-3 font-mono text-xs text-zinc-200 resize-y focus:outline-none focus:border-blue-500 leading-relaxed"
                  spellcheck={false}
                />

                {/* Actions */}
                <div class="flex items-center gap-3">
                  <button
                    onClick={save}
                    disabled={saving || !isDirty}
                    class="px-4 py-2 text-sm bg-green-700 hover:bg-green-600 disabled:opacity-40 text-white rounded transition-colors"
                  >
                    {saving ? 'Sauvegarde…' : isDirty ? '💾 Sauvegarder en DB' : '✓ À jour'}
                  </button>
                  <button
                    onClick={syncOne}
                    disabled={syncing}
                    class="px-4 py-2 text-sm bg-blue-700 hover:bg-blue-600 disabled:opacity-40 text-white rounded transition-colors"
                  >
                    {syncing ? 'Sync…' : '⚡ Écrire .md'}
                  </button>
                  {isDirty && (
                    <button
                      onClick={async () => { await save(); await syncOne(); }}
                      disabled={saving || syncing}
                      class="px-4 py-2 text-sm bg-purple-700 hover:bg-purple-600 disabled:opacity-40 text-white rounded transition-colors"
                    >
                      💾⚡ Sauvegarder + Sync
                    </button>
                  )}
                  {msg && (
                    <span class={`text-xs px-3 py-1.5 rounded ${msg.type === 'ok' ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                      {msg.text}
                    </span>
                  )}
                  <span class="text-[10px] text-zinc-500 ml-auto">
                    {draft.length.toLocaleString()} caractères
                  </span>
                </div>
              </>
            ) : (
              <div class="flex items-center justify-center h-full text-zinc-500 text-sm">
                Sélectionne un agent à gauche
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'status' && (
        <div class="overflow-x-auto">
          <table class="w-full text-xs text-zinc-300 border-collapse">
            <thead>
              <tr class="border-b border-zinc-700 text-zinc-500 text-left">
                <th class="py-2 px-3">Agent</th>
                <th class="py-2 px-3">Modèle</th>
                <th class="py-2 px-3">Fichier .md</th>
                <th class="py-2 px-3">Fichier présent</th>
                <th class="py-2 px-3">Activé</th>
                <th class="py-2 px-3">Dernière MAJ</th>
                <th class="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {syncStatus.map(s => (
                <tr key={s.agentId} class="border-b border-zinc-800 hover:bg-zinc-800/40">
                  <td class="py-2 px-3 font-mono font-bold">{s.agentId}</td>
                  <td class="py-2 px-3 text-zinc-400">{s.model}</td>
                  <td class="py-2 px-3 text-zinc-500 font-mono text-[10px]">{s.filePath}</td>
                  <td class="py-2 px-3">
                    <span class={`px-2 py-0.5 rounded text-[10px] ${s.fileExists ? 'bg-green-900 text-green-300' : 'bg-red-900 text-red-300'}`}>
                      {s.fileExists ? '✓ OK' : '✗ Absent'}
                    </span>
                  </td>
                  <td class="py-2 px-3">
                    <span class={`px-2 py-0.5 rounded text-[10px] ${s.enabled ? 'bg-blue-900 text-blue-300' : 'bg-zinc-700 text-zinc-400'}`}>
                      {s.enabled ? 'Activé' : 'Désactivé'}
                    </span>
                  </td>
                  <td class="py-2 px-3 text-zinc-500">
                    {new Date(s.updatedAt).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                  </td>
                  <td class="py-2 px-3">
                    <button
                      onClick={async () => {
                        const agent = agents.find(a => a.agentId === s.agentId);
                        if (agent) { selectAgent(agent); setTab('edit'); }
                      }}
                      class="text-[10px] px-2 py-1 bg-zinc-700 hover:bg-zinc-600 rounded"
                    >
                      Éditer
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
