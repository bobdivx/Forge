import { useEffect, useMemo, useState } from 'preact/hooks';

type Tool = {
  id: number;
  name: string;
  displayName: string;
  description: string;
  category: string;
  implementationKind: string;
  builtin: boolean;
  enabled: boolean;
};

type Assignment = {
  assignmentId: number;
  toolId: number;
  enabled: boolean;
  source: string;
  createdAt: string;
  tool: Tool | null;
};

type Props = {
  agentId: string;
  /** Variante compacte pour modale (cache certains détails). */
  compact?: boolean;
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

export default function AgentToolsPanel({ agentId, compact = false }: Props) {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [catalog, setCatalog] = useState<Tool[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<number, boolean>>({});
  const [showCatalog, setShowCatalog] = useState(false);
  const [filter, setFilter] = useState<'all' | 'assigned' | 'available'>('all');
  const [query, setQuery] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [a, c] = await Promise.all([
        fetch(`/api/agent-tool-assignments?agentId=${encodeURIComponent(agentId)}`).then((r) => r.json()),
        fetch('/api/agent-tools').then((r) => r.json()),
      ]);
      setAssignments(Array.isArray(a.items) ? a.items : []);
      setCatalog(Array.isArray(c.tools) ? c.tools : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (agentId) void load();
  }, [agentId]);

  const assignedIds = useMemo(() => new Set(assignments.map((a) => a.toolId)), [assignments]);

  const toggleAssignment = async (assignment: Assignment) => {
    const next = !assignment.enabled;
    setAssignments((prev) =>
      prev.map((a) => (a.assignmentId === assignment.assignmentId ? { ...a, enabled: next } : a)),
    );
    setBusy((b) => ({ ...b, [assignment.toolId]: true }));
    try {
      await fetch('/api/agent-tool-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, toolId: assignment.toolId, enabled: next }),
      });
    } finally {
      setBusy((b) => ({ ...b, [assignment.toolId]: false }));
    }
  };

  const removeAssignment = async (assignment: Assignment) => {
    if (!confirm(`Retirer "${assignment.tool?.name}" de ${agentId} ?`)) return;
    setBusy((b) => ({ ...b, [assignment.toolId]: true }));
    try {
      await fetch(
        `/api/agent-tool-assignments?agentId=${encodeURIComponent(agentId)}&toolId=${assignment.toolId}`,
        { method: 'DELETE' },
      );
      void load();
    } finally {
      setBusy((b) => ({ ...b, [assignment.toolId]: false }));
    }
  };

  const assignTool = async (toolId: number) => {
    setBusy((b) => ({ ...b, [toolId]: true }));
    try {
      await fetch('/api/agent-tool-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, toolId, enabled: true, source: 'manual' }),
      });
      void load();
    } finally {
      setBusy((b) => ({ ...b, [toolId]: false }));
    }
  };

  const availableTools = useMemo(
    () => catalog.filter((t) => !assignedIds.has(t.id) && t.enabled),
    [catalog, assignedIds],
  );

  const filteredAssignments = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignments.filter((a) => {
      if (filter === 'assigned' && !a.enabled) return false;
      if (filter === 'available') return false;
      if (!a.tool) return false;
      if (!q) return true;
      return (
        a.tool.name.toLowerCase().includes(q) ||
        a.tool.displayName.toLowerCase().includes(q) ||
        a.tool.category.toLowerCase().includes(q)
      );
    });
  }, [assignments, filter, query]);

  if (loading) {
    return (
      <div class="rounded-2xl border border-gray-100 bg-white p-4 text-xs text-gray-500">
        Chargement des outils...
      </div>
    );
  }

  return (
    <div class={`space-y-4 ${compact ? '' : 'rounded-[1.5rem] border border-gray-100 bg-white p-5 shadow-sm'}`}>
      {!compact && (
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="text-sm font-bold text-gray-900">Outils & capacités</h3>
            <p class="text-[11px] text-gray-500">
              Outils disponibles pour <code class="rounded bg-gray-100 px-1 font-mono">{agentId}</code> via tool calling
              natif Ollama.
            </p>
          </div>
          <div class="flex items-center gap-2">
            <input
              type="search"
              placeholder="Rechercher..."
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
              class="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs"
            />
            <button
              onClick={() => setShowCatalog((v) => !v)}
              class="rounded-full bg-[#175B37] px-3 py-1.5 text-xs font-bold text-white"
            >
              {showCatalog ? 'Fermer le catalogue' : '+ Ajouter un outil'}
            </button>
          </div>
        </div>
      )}

      {showCatalog && (
        <div class="rounded-xl border border-emerald-200 bg-emerald-50/30 p-3">
          <p class="mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-700">Catalogue disponible</p>
          {availableTools.length === 0 ? (
            <p class="text-xs text-gray-500 italic">Tous les outils du catalogue sont déjà assignés.</p>
          ) : (
            <div class="grid grid-cols-1 gap-2 md:grid-cols-2">
              {availableTools.map((t) => (
                <button
                  key={t.id}
                  onClick={() => assignTool(t.id)}
                  disabled={busy[t.id]}
                  class="flex items-start gap-2 rounded-lg border border-gray-200 bg-white p-2 text-left text-xs hover:border-emerald-300 hover:bg-emerald-50/50 disabled:opacity-50"
                >
                  <span class="text-emerald-600">+</span>
                  <span class="min-w-0 flex-1">
                    <code class="font-mono text-[10px] text-gray-700">{t.name}</code>
                    <span class="block truncate text-[10px] text-gray-500">{t.description}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div class="space-y-2">
        {filteredAssignments.length === 0 ? (
          <p class="text-xs text-gray-400 italic">Aucun outil assigné.</p>
        ) : (
          filteredAssignments.map((a) => {
            const t = a.tool!;
            return (
              <div
                key={a.assignmentId}
                class={`rounded-xl border p-3 transition ${
                  a.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                }`}
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-1.5">
                      <code class="rounded bg-gray-900 px-2 py-0.5 text-[10px] font-mono text-white">{t.name}</code>
                      <span class="text-xs font-semibold text-gray-900">{t.displayName}</span>
                      <span class="rounded-full border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-gray-600">
                        {CATEGORY_LABELS[t.category] || t.category}
                      </span>
                      {t.builtin ? (
                        <span class="rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-emerald-700">
                          builtin
                        </span>
                      ) : null}
                      {a.source === 'self_installed' && (
                        <span class="rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-violet-700">
                          auto-installé
                        </span>
                      )}
                    </div>
                    <p class="mt-1 text-[11px] text-gray-600">{t.description}</p>
                  </div>
                  <div class="flex shrink-0 flex-col items-end gap-1">
                    <label class="inline-flex cursor-pointer items-center gap-1.5 text-[10px] font-semibold text-gray-600">
                      <input
                        type="checkbox"
                        checked={a.enabled}
                        disabled={busy[a.toolId]}
                        onChange={() => toggleAssignment(a)}
                        class="rounded border-gray-300 text-[#175B37] focus:ring-[#175B37]"
                      />
                      {a.enabled ? 'Actif' : 'Off'}
                    </label>
                    <button
                      onClick={() => removeAssignment(a)}
                      disabled={busy[a.toolId]}
                      class="text-[10px] text-rose-600 hover:underline disabled:opacity-50"
                    >
                      Retirer
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {!compact && (
        <p class="text-[10px] text-gray-400">
          Les outils builtin proviennent du code Forge. Les outils auto-installés ont été créés par l'agent via{' '}
          <code class="rounded bg-gray-100 px-1 font-mono">request_tool</code>.
        </p>
      )}
    </div>
  );
}
