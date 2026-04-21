import { useEffect, useMemo, useState } from 'preact/hooks';
import ForgeAgentProtocolHint from './ForgeAgentProtocolHint';

type AgentRow = {
  agentId: string;
  model: string;
  filePath: string;
  systemPrompt: string;
  enabled: number;
  updatedAt: string;
};

type SyncStatus = {
  agentId: string;
  model: string;
  filePath: string;
  enabled: boolean;
  fileExists: boolean;
  updatedAt: string;
};

type AgentTemplate = {
  id: string;
  label: string;
  defaultModel: string;
  filePath: string;
  defaultPrompt?: string;
};

const MODEL_FALLBACK = ['qwen2.5-coder:7b', 'qwen2.5:7b', 'llama3.1:8b'];

export default function AgentInstructionEditor() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [syncStatus, setSyncStatus] = useState<SyncStatus[]>([]);
  const [models, setModels] = useState<string[]>(MODEL_FALLBACK);
  const [selectedId, setSelectedId] = useState('');
  const [draftPrompt, setDraftPrompt] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [draftEnabled, setDraftEnabled] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [templates, setTemplates] = useState<AgentTemplate[]>([]);

  const [newAgentId, setNewAgentId] = useState('');
  const [newAgentTemplate, setNewAgentTemplate] = useState('');
  const [newAgentModelMode, setNewAgentModelMode] = useState<'list' | 'custom'>('list');
  const [newAgentModelFromList, setNewAgentModelFromList] = useState(MODEL_FALLBACK[0]);
  const [newAgentModelCustom, setNewAgentModelCustom] = useState('');
  const [newAgentPrompt, setNewAgentPrompt] = useState('');

  const selected = useMemo(
    () => agents.find((a) => a.agentId === selectedId) ?? null,
    [agents, selectedId],
  );

  const selectedSync = useMemo(
    () => syncStatus.find((s) => s.agentId === selectedId) ?? null,
    [syncStatus, selectedId],
  );

  const uiModels = models.length > 0 ? models : MODEL_FALLBACK;

  const loadAll = async () => {
    try {
      const [rAgents, rSync, rModels, rTemplates] = await Promise.all([
        fetch('/api/agent-instructions').then((r) => r.json().catch(() => [])),
        fetch('/api/sync-agents').then((r) => r.json().catch(() => [])),
        fetch('/api/models').then((r) => r.json().catch(() => [])),
        fetch('/api/agent-template-models').then((r) => r.json().catch(() => ({ templates: [] })),
        ),
      ]);
      const nextTemplates = Array.isArray((rTemplates as { templates?: unknown[] }).templates)
        ? ((rTemplates as { templates: AgentTemplate[] }).templates as AgentTemplate[])
        : [];

      const nextAgents = Array.isArray(rAgents) ? (rAgents as AgentRow[]) : [];
      const nextSync = Array.isArray(rSync) ? (rSync as SyncStatus[]) : [];
      const nextModelsRaw = Array.isArray(rModels)
        ? rModels
            .map((m: { id?: string; name?: string }) =>
              String(m.id || m.name || '').replace(/^openclaw\//i, '').trim(),
            )
            .filter(Boolean)
        : [];

      const inferredModels = nextAgents.map((a) => String(a.model || '').trim()).filter(Boolean);
      const mergedModels = [...new Set([...MODEL_FALLBACK, ...nextModelsRaw, ...inferredModels])].sort((a, b) =>
        a.localeCompare(b),
      );

      setAgents(nextAgents.sort((a, b) => a.agentId.localeCompare(b.agentId)));
      setSyncStatus(nextSync);
      setModels(mergedModels);
      setTemplates(nextTemplates);

      if (!selectedId && nextAgents.length > 0) {
        setSelectedId(nextAgents[0].agentId);
      }
      if (!mergedModels.includes(newAgentModelFromList)) {
        setNewAgentModelFromList(mergedModels[0] || MODEL_FALLBACK[0]);
      }
      if (!newAgentTemplate && nextTemplates.length > 0) {
        const t = nextTemplates[0];
        setNewAgentTemplate(t.id);
        setNewAgentId(t.id);
        if (t.defaultModel) setNewAgentModelFromList(t.defaultModel);
      }
    } catch {
      setMsg({ type: 'err', text: 'Impossible de charger les données.' });
    }
  };

  useEffect(() => {
    if (!newAgentTemplate) return;
    const t = templates.find((x) => x.id === newAgentTemplate);
    if (!t) return;
    setNewAgentId(t.id);
    if (newAgentModelMode === 'list' && t.defaultModel) {
      setNewAgentModelFromList(t.defaultModel);
    }
    if (typeof t.defaultPrompt === 'string') {
      setNewAgentPrompt(t.defaultPrompt);
    }
  }, [newAgentTemplate, templates, newAgentModelMode]);

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDraftPrompt(selected.systemPrompt);
    setDraftModel(selected.model);
    setDraftEnabled(selected.enabled === 1);
  }, [selectedId, selected?.agentId]);

  const saveSelected = async () => {
    if (!selected) return;
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch('/api/agent-instructions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: selected.agentId,
          systemPrompt: draftPrompt,
          model: draftModel.trim(),
          enabled: draftEnabled,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) {
        setMsg({ type: 'err', text: data.error || 'Sauvegarde impossible.' });
        return;
      }
      setMsg({ type: 'ok', text: 'Agent sauvegardé.' });
      await loadAll();
    } catch {
      setMsg({ type: 'err', text: 'Erreur réseau.' });
    } finally {
      setSaving(false);
    }
  };

  const syncSelected = async () => {
    if (!selected) return;
    setSyncing(true);
    setMsg(null);
    try {
      const r = await fetch('/api/sync-agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: selected.agentId }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) {
        setMsg({ type: 'err', text: data.error || 'Sync impossible.' });
        return;
      }
      setMsg({ type: 'ok', text: `Sync ${selected.agentId} OK.` });
      await loadAll();
    } catch {
      setMsg({ type: 'err', text: 'Erreur réseau.' });
    } finally {
      setSyncing(false);
    }
  };

  const createAgent = async () => {
    const agentId = newAgentId.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const model =
      newAgentModelMode === 'list'
        ? newAgentModelFromList.trim()
        : newAgentModelCustom.trim();
    if (!agentId || !model) {
      setMsg({ type: 'err', text: 'ID agent et modèle requis.' });
      return;
    }

    setCreating(true);
    setMsg(null);
    try {
      const r = await fetch('/api/agent-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          model,
          enabled: true,
          ...(newAgentPrompt.trim() ? { systemPrompt: newAgentPrompt.trim() } : {}),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) {
        setMsg({ type: 'err', text: data.error || 'Création impossible.' });
        return;
      }
      setMsg({ type: 'ok', text: `Agent ${agentId} créé.` });
      setNewAgentId('');
      setNewAgentPrompt('');
      setNewAgentModelCustom('');
      await loadAll();
      setSelectedId(agentId);
    } catch {
      setMsg({ type: 'err', text: 'Erreur réseau.' });
    } finally {
      setCreating(false);
    }
  };

  return (
    <div class="space-y-4">
      <ForgeAgentProtocolHint />

      <div class="rounded-[1.5rem] border border-gray-100 bg-white p-5 shadow-sm space-y-3">
        <p class="text-sm font-semibold text-gray-900">Ajouter un agent</p>
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label class="mb-1 block text-[11px] text-gray-500">Modèle d’agent</label>
            <select
              value={newAgentTemplate}
              onChange={(e) => setNewAgentTemplate((e.target as HTMLSelectElement).value)}
              class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 outline-none focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15"
            >
              <option value="">Personnalisé</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label class="mb-1 block text-[11px] text-gray-500">ID agent</label>
            <input
              value={newAgentId}
              onInput={(e) => setNewAgentId((e.target as HTMLInputElement).value)}
              placeholder="ex: DEV_DATA"
              class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 outline-none focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15"
            />
          </div>
        </div>
        <div>
          <label class="mb-1 block text-[11px] text-gray-500">Type de LLM</label>
          <div class="flex gap-2">
            <button
              type="button"
              onClick={() => setNewAgentModelMode('list')}
              class={`rounded px-3 py-2 text-xs ${
                newAgentModelMode === 'list'
                  ? 'bg-[#175B37] text-white'
                  : 'border border-gray-200 bg-white text-gray-600'
              }`}
            >
              Liste LLM
            </button>
            <button
              type="button"
              onClick={() => setNewAgentModelMode('custom')}
              class={`rounded px-3 py-2 text-xs ${
                newAgentModelMode === 'custom'
                  ? 'bg-[#175B37] text-white'
                  : 'border border-gray-200 bg-white text-gray-600'
              }`}
            >
              LLM personnalisé
            </button>
          </div>
        </div>

        {newAgentModelMode === 'list' ? (
          <div>
            <label class="mb-1 block text-[11px] text-gray-500">LLM</label>
            <select
              value={newAgentModelFromList}
              onChange={(e) => setNewAgentModelFromList((e.target as HTMLSelectElement).value)}
              class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 outline-none focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15"
            >
              {uiModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div>
            <label class="mb-1 block text-[11px] text-gray-500">LLM personnalisé</label>
            <input
              value={newAgentModelCustom}
              onInput={(e) => setNewAgentModelCustom((e.target as HTMLInputElement).value)}
              placeholder="ex: my-model:latest"
              class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 outline-none focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15"
            />
          </div>
        )}

        <div>
          <label class="mb-1 block text-[11px] text-gray-500">Prompt initial (optionnel)</label>
          <textarea
            value={newAgentPrompt}
            onInput={(e) => setNewAgentPrompt((e.target as HTMLTextAreaElement).value)}
            rows={4}
            class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 outline-none focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15"
          />
        </div>

        <button
          type="button"
          onClick={() => void createAgent()}
          disabled={creating}
          class="rounded-full bg-[#175B37] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
        >
          {creating ? 'Création…' : 'Ajouter l’agent'}
        </button>
      </div>

      <div class="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
        <div class="rounded-[1.5rem] border border-gray-100 bg-white p-3 shadow-sm max-h-[560px] overflow-y-auto">
          {agents.length === 0 ? (
            <p class="p-3 text-xs text-gray-500">Aucun agent pour le moment.</p>
          ) : (
            agents.map((a) => (
              <button
                key={a.agentId}
                type="button"
                onClick={() => setSelectedId(a.agentId)}
                class={`mb-1 w-full rounded px-3 py-2 text-left ${
                  selectedId === a.agentId
                    ? 'bg-[#175B37] text-white'
                    : 'bg-gray-50 text-gray-800 hover:bg-gray-100'
                }`}
              >
                <div class="truncate font-mono text-xs font-semibold">{a.agentId}</div>
                <div class="truncate text-[10px] opacity-80">{a.model}</div>
              </button>
            ))
          )}
        </div>

        <div class="rounded-[1.5rem] border border-gray-100 bg-white p-5 shadow-sm">
          {!selected ? (
            <p class="text-sm text-gray-500">Sélectionne un agent à gauche pour l’éditer.</p>
          ) : (
            <div class="space-y-3">
              <div class="flex flex-wrap items-center gap-3">
                <h3 class="font-mono text-sm font-bold text-gray-900">{selected.agentId}</h3>
                <label class="inline-flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={draftEnabled}
                    onChange={(e) => setDraftEnabled((e.target as HTMLInputElement).checked)}
                  />
                  Activé
                </label>
                <span class="ml-auto text-[10px] text-gray-500">{selected.filePath}</span>
                {selectedSync ? (
                  <span
                    class={`rounded px-2 py-0.5 text-[10px] ${
                      selectedSync.fileExists
                        ? 'bg-green-900 text-green-300'
                        : 'bg-yellow-900 text-yellow-300'
                    }`}
                  >
                    {selectedSync.fileExists ? 'fichier OK' : 'fichier absent'}
                  </span>
                ) : null}
              </div>

              <div>
                <label class="mb-1 block text-[11px] text-gray-500">Modèle</label>
                <input
                  list="forge-agent-models"
                  value={draftModel}
                  onInput={(e) => setDraftModel((e.target as HTMLInputElement).value)}
                  class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 outline-none focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15"
                />
                <datalist id="forge-agent-models">
                  {uiModels.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              <div>
                <label class="mb-1 block text-[11px] text-gray-500">Prompt système</label>
                <textarea
                  value={draftPrompt}
                  onInput={(e) => setDraftPrompt((e.target as HTMLTextAreaElement).value)}
                  rows={18}
                  class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-800 outline-none focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15"
                />
              </div>

              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void saveSelected()}
                  disabled={saving}
                  class="rounded-full bg-[#175B37] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                >
                  {saving ? 'Sauvegarde…' : 'Sauvegarder'}
                </button>
                <button
                  type="button"
                  onClick={() => void syncSelected()}
                  disabled={syncing}
                  class="rounded-full bg-blue-600 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-90"
                >
                  {syncing ? 'Sync…' : 'Sync .md'}
                </button>
                <button
                  type="button"
                  onClick={() => void loadAll()}
                  class="rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Rafraîchir
                </button>
                <span class="ml-auto text-[10px] text-gray-500">
                  {draftPrompt.length.toLocaleString()} caractères
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {msg ? (
        <div
          class={`rounded-lg px-3 py-2 text-xs ${
            msg.type === 'ok' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-red-900/40 text-red-300'
          }`}
        >
          {msg.text}
        </div>
      ) : null}
    </div>
  );
}
