import { useEffect, useMemo, useState } from 'preact/hooks';

type Tool = {
  id: number;
  name: string;
  displayName: string;
  description: string;
  category: string;
  parametersJson: string;
  implementationKind: 'builtin' | 'exec_template' | 'http';
  implementationConfig: string;
  enabled: boolean;
  builtin: boolean;
  requiresApproval: boolean;
  createdByAgentId: string | null;
  createdAt: string;
  updatedAt: string;
};

const CATEGORY_LABELS: Record<string, string> = {
  filesystem: 'Fichiers',
  git: 'Git',
  github: 'GitHub',
  shell: 'Shell',
  forge: 'Forge',
  network: 'Réseau',
  custom: 'Custom',
};
const CATEGORY_COLORS: Record<string, string> = {
  filesystem: 'bg-blue-50 text-blue-700 border-blue-200',
  git: 'bg-orange-50 text-orange-700 border-orange-200',
  github: 'bg-purple-50 text-purple-700 border-purple-200',
  shell: 'bg-gray-100 text-gray-700 border-gray-300',
  forge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  network: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  custom: 'bg-amber-50 text-amber-700 border-amber-200',
};

const emptyDraft = () => ({
  name: '',
  displayName: '',
  description: '',
  category: 'custom',
  command: '',
  parametersJson: '{"type":"object","properties":{}}',
});

export default function AgentToolsCatalog() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'builtin' | 'custom' | 'self_installed'>('all');
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/agent-tools').then((r) => r.json());
      setTools(Array.isArray(data.tools) ? data.tools : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tools.filter((t) => {
      if (filter === 'builtin' && !t.builtin) return false;
      if (filter === 'custom' && t.builtin) return false;
      if (filter === 'self_installed' && !t.createdByAgentId) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.displayName.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q)
      );
    });
  }, [tools, filter, query]);

  const toggleEnabled = async (tool: Tool) => {
    const next = !tool.enabled;
    setTools((prev) => prev.map((t) => (t.id === tool.id ? { ...t, enabled: next } : t)));
    try {
      await fetch('/api/agent-tools', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tool.id, enabled: next }),
      });
    } catch {
      void load();
    }
  };

  const removeTool = async (tool: Tool) => {
    if (tool.builtin) {
      alert('Outil builtin : tu peux seulement le désactiver.');
      return;
    }
    if (!confirm(`Supprimer l'outil ${tool.name} ? Toutes les assignations seront retirées.`)) return;
    await fetch(`/api/agent-tools?id=${tool.id}`, { method: 'DELETE' });
    void load();
  };

  const createTool = async () => {
    const name = draft.name.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!name || !draft.command.trim()) {
      setMessage('Nom et commande requis.');
      return;
    }
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/agent-tools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          displayName: draft.displayName.trim() || name,
          description: draft.description.trim() || `Outil custom ${name}`,
          category: draft.category,
          command: draft.command,
          parametersJson: draft.parametersJson,
          implementationKind: 'exec_template',
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setModalOpen(false);
        setDraft(emptyDraft());
        void load();
      } else {
        setMessage(data.error || 'Erreur création.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p class="text-xs text-gray-500">Chargement du catalogue...</p>;

  return (
    <div class="space-y-4">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-gray-900">Catalogue d'outils</h3>
          <p class="text-[11px] text-gray-500">
            Outils disponibles pour les agents Forge — builtins (code) + custom (UI / agents).
          </p>
        </div>
        <div class="flex items-center gap-2">
          <input
            type="search"
            placeholder="Rechercher..."
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            class="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs outline-none focus:border-[#175B37]"
          />
          <select
            value={filter}
            onChange={(e) => setFilter((e.target as HTMLSelectElement).value as typeof filter)}
            class="rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs"
          >
            <option value="all">Tous</option>
            <option value="builtin">Builtin</option>
            <option value="custom">Custom</option>
            <option value="self_installed">Auto-installés</option>
          </select>
          <button
            onClick={() => {
              setDraft(emptyDraft());
              setMessage('');
              setModalOpen(true);
            }}
            class="rounded-full bg-[#175B37] px-3 py-1.5 text-xs font-bold text-white"
          >
            + Outil custom
          </button>
        </div>
      </div>

      <div class="space-y-2">
        {filtered.length === 0 ? (
          <p class="text-xs text-gray-400 italic">Aucun outil.</p>
        ) : (
          filtered.map((t) => (
            <div key={t.id} class="rounded-xl border border-gray-200 bg-white p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <div class="flex flex-wrap items-center gap-2">
                    <code class="rounded bg-gray-900 px-2 py-0.5 text-[11px] font-mono text-white">{t.name}</code>
                    <span class="text-xs font-semibold text-gray-900">{t.displayName}</span>
                    <span
                      class={`rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest ${
                        CATEGORY_COLORS[t.category] || 'bg-gray-100 text-gray-700 border-gray-200'
                      }`}
                    >
                      {CATEGORY_LABELS[t.category] || t.category}
                    </span>
                    {t.builtin ? (
                      <span class="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-emerald-700">
                        builtin
                      </span>
                    ) : (
                      <span class="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-700">
                        custom
                      </span>
                    )}
                    {t.createdByAgentId && (
                      <span class="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest text-violet-700">
                        auto-installé · {t.createdByAgentId}
                      </span>
                    )}
                  </div>
                  <p class="mt-1.5 text-xs text-gray-600">{t.description}</p>
                  {t.implementationKind === 'exec_template' && (
                    <code class="mt-1.5 block max-w-full overflow-x-auto whitespace-pre rounded bg-gray-50 px-2 py-1 text-[10px] font-mono text-gray-700">
                      {(() => {
                        try {
                          return JSON.parse(t.implementationConfig).command || '—';
                        } catch {
                          return '—';
                        }
                      })()}
                    </code>
                  )}
                </div>
                <div class="flex shrink-0 flex-col items-end gap-1">
                  <label class="inline-flex cursor-pointer items-center gap-2 text-[10px] font-semibold text-gray-600">
                    <input
                      type="checkbox"
                      checked={t.enabled}
                      onChange={() => toggleEnabled(t)}
                      class="rounded border-gray-300 text-[#175B37] focus:ring-[#175B37]"
                    />
                    {t.enabled ? 'Activé' : 'Désactivé'}
                  </label>
                  {!t.builtin && (
                    <button onClick={() => removeTool(t)} class="text-[10px] text-rose-600 hover:underline">
                      Supprimer
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {modalOpen && (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div class="w-full max-w-2xl space-y-4 rounded-2xl bg-white p-5 shadow-2xl">
            <div class="flex items-center justify-between">
              <h3 class="text-sm font-bold text-gray-900">Nouvel outil custom</h3>
              <button onClick={() => setModalOpen(false)} class="text-xs text-gray-500">
                Fermer
              </button>
            </div>
            <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
              <input
                placeholder="Nom technique (ex: docker_logs)"
                value={draft.name}
                onInput={(e) => setDraft((d) => ({ ...d, name: (e.target as HTMLInputElement).value }))}
                class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono"
              />
              <input
                placeholder="Libellé affiché"
                value={draft.displayName}
                onInput={(e) => setDraft((d) => ({ ...d, displayName: (e.target as HTMLInputElement).value }))}
                class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
              />
              <select
                value={draft.category}
                onChange={(e) => setDraft((d) => ({ ...d, category: (e.target as HTMLSelectElement).value }))}
                class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm md:col-span-2"
              >
                {Object.entries(CATEGORY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <textarea
                placeholder="Description (lue par les LLM — soit explicite)"
                value={draft.description}
                onInput={(e) => setDraft((d) => ({ ...d, description: (e.target as HTMLTextAreaElement).value }))}
                rows={2}
                class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm md:col-span-2"
              />
              <textarea
                placeholder="Commande shell. Variables : {{__projectPath}}, {{__githubToken}}, {{__branch}}, ou tes propres args {{nomArg}}"
                value={draft.command}
                onInput={(e) => setDraft((d) => ({ ...d, command: (e.target as HTMLTextAreaElement).value }))}
                rows={3}
                class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-mono md:col-span-2"
              />
              <textarea
                placeholder="JSON Schema des paramètres"
                value={draft.parametersJson}
                onInput={(e) => setDraft((d) => ({ ...d, parametersJson: (e.target as HTMLTextAreaElement).value }))}
                rows={4}
                class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-mono md:col-span-2"
              />
            </div>
            {message && <p class="text-xs text-rose-600">{message}</p>}
            <div class="flex justify-end gap-2">
              <button
                onClick={() => setModalOpen(false)}
                class="rounded-full border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={createTool}
                disabled={saving}
                class="rounded-full bg-[#175B37] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
              >
                {saving ? 'Création...' : 'Créer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
