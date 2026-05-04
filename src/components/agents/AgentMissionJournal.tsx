import { useState, useEffect } from 'preact/hooks';

export type MissionTask = {
  id: number;
  agentId: string;
  task: string;
  input: string | null;
  output: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

function statusBadgeClass(status: string) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'success' || s === 'completed' || s === 'resolved') return 'bg-green-50 text-green-600';
  if (s === 'running' || s === 'in_progress') return 'bg-blue-50 text-blue-600';
  if (s === 'error' || s === 'failed' || s === 'bug' || s === 'rejected') return 'bg-red-50 text-red-500';
  if (s === 'cancelled') return 'bg-gray-100 text-gray-500';
  return 'bg-yellow-50 text-yellow-600';
}

const STATUS_OPTIONS = ['pending', 'running', 'completed', 'failed', 'bug', 'cancelled'] as const;

function readApiError(data: Record<string, unknown> | null | undefined, fallback = 'Action refusée'): string {
  if (!data) return fallback;
  const e = data.error;
  let main = fallback;
  if (typeof e === 'string') main = e;
  else if (e && typeof e === 'object' && typeof (e as { message?: string }).message === 'string') {
    main = String((e as { message: string }).message);
  } else if (typeof data.message === 'string') main = data.message;

  const hint = data.hint;
  if (typeof hint === 'string' && hint.length > 0 && main !== hint) {
    return `${main} — ${hint}`;
  }
  return main;
}

type Props = {
  initialTasks: MissionTask[];
  /** Si renseigné, resynchronise le tableau avec `/api/swarm-agent-panel` (poll + événement forge-swarm-refresh). */
  syncAgentId?: string;
};

export default function AgentMissionJournal({ initialTasks, syncAgentId }: Props) {
  const [tasks, setTasks] = useState<MissionTask[]>(initialTasks);
  const [openId, setOpenId] = useState<number | null>(null);
  const [editTask, setEditTask] = useState('');
  const [editInput, setEditInput] = useState('');
  const [editOutput, setEditOutput] = useState('');
  const [editStatus, setEditStatus] = useState<string>('pending');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [forcing, setForcing] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    if (!syncAgentId) return;
    const pull = () => {
      void fetch(`/api/swarm-agent-panel?agentId=${encodeURIComponent(syncAgentId)}`)
        .then((r) => r.json() as Promise<{ dbTasks?: MissionTask[] }>)
        .then((d) => {
          if (Array.isArray(d.dbTasks)) setTasks(d.dbTasks);
        })
        .catch(() => {});
    };
    pull();
    const t = setInterval(pull, 14_000);
    const onRefresh = (e: Event) => {
      const id = (e as CustomEvent<{ agentId?: string }>).detail?.agentId;
      if (id && id !== syncAgentId) return;
      pull();
    };
    window.addEventListener('forge-swarm-refresh', onRefresh as EventListener);
    return () => {
      clearInterval(t);
      window.removeEventListener('forge-swarm-refresh', onRefresh as EventListener);
    };
  }, [syncAgentId]);

  const selected = openId != null ? tasks.find((t) => t.id === openId) : null;

  const openModal = (t: MissionTask) => {
    setOpenId(t.id);
    setEditTask(t.task);
    setEditInput(t.input ?? '');
    setEditOutput(t.output ?? '');
    setEditStatus(t.status || 'pending');
    setBanner(null);
  };

  const closeModal = () => {
    setOpenId(null);
    setBanner(null);
  };

  const save = async () => {
    if (openId == null) return;
    setSaving(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/agent-tasks/${openId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task: editTask,
          input: editInput,
          output: editOutput,
          status: editStatus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ type: 'err', text: readApiError(data as Record<string, unknown>, 'Enregistrement refusé') });
        return;
      }
      const row = data.task as MissionTask | null;
      if (row) {
        const r = row as MissionTask;
        setTasks((prev) => prev.map((x) => (x.id === r.id ? r : x)));
        setEditTask(r.task);
        setEditInput(r.input ?? '');
        setEditOutput(r.output ?? '');
        setEditStatus(r.status || 'pending');
      }
      setBanner({ type: 'ok', text: 'Modifications enregistrées.' });
    } catch {
      setBanner({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (openId == null) return;
    if (!confirm('Supprimer définitivement cette entrée du journal ?')) return;
    setDeleting(true);
    setBanner(null);
    try {
      const res = await fetch(`/api/agent-tasks/${openId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBanner({ type: 'err', text: readApiError(data as Record<string, unknown>, 'Suppression refusée') });
        return;
      }
      setTasks((prev) => prev.filter((x) => x.id !== openId));
      closeModal();
    } catch {
      setBanner({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setDeleting(false);
    }
  };

  const forceDispatch = async () => {
    if (openId == null) return;
    setForcing(true);
    setBanner(null);
    try {
      const res = await fetch('/api/agent-task-redispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: openId }),
      });
      const rawText = await res.text();
      let data: Record<string, unknown> = {};
      try {
        data = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
      } catch {
        setBanner({
          type: 'err',
          text: `Réponse invalide (HTTP ${res.status}) : ${rawText.slice(0, 500)}`,
        });
        return;
      }
      if (!res.ok) {
        setBanner({ type: 'err', text: readApiError(data, 'Relance refusée') });
        return;
      }
      const row = data.task as MissionTask | null;
      if (row) {
        setTasks((prev) => prev.map((x) => (x.id === row.id ? (row as MissionTask) : x)));
        setEditStatus(row.status || 'running');
      }
      setBanner({
        type: 'ok',
        text: typeof data.message === 'string' ? data.message : "Relance exécutée par l'orchestrateur Forge.",
      });
    } catch {
      setBanner({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setForcing(false);
    }
  };

  if (tasks.length === 0) {
    return (
      <p class="text-center py-12 text-gray-400 italic text-sm">Aucun enregistrement persistant pour cet agent.</p>
    );
  }

  return (
    <div class="relative">
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-gray-100">
              <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-left">Date</th>
              <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-left">Tâche</th>
              <th class="text-[10px] uppercase font-bold text-gray-400 px-5 py-3 text-left">Statut</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr
                key={t.id}
                role="button"
                tabIndex={0}
                class="border-b border-gray-50 hover:bg-blue-50/60 transition-colors cursor-pointer"
                onClick={() => openModal(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openModal(t);
                  }
                }}
              >
                <td class="px-5 py-3 text-xs text-gray-400 whitespace-nowrap font-mono">
                  {new Date(t.createdAt).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
                <td class="px-5 py-3 text-xs text-gray-800 font-medium">
                  <div class="max-w-md truncate">{t.task}</div>
                  {t.input ? (
                    <div class="text-[10px] text-gray-400 italic mt-0.5 truncate">{t.input.slice(0, 80)}…</div>
                  ) : null}
                </td>
                <td class="px-5 py-3">
                  <span class={`text-[10px] font-semibold px-2 py-1 rounded ${statusBadgeClass(t.status)}`}>
                    {t.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openId != null && selected ? (
        <div
          class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px]"
          role="presentation"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div
            class="bg-white rounded-2xl shadow-xl border border-gray-100 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mission-modal-title"
          >
            <div class="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-start justify-between gap-4">
              <div>
                <h4 id="mission-modal-title" class="font-semibold text-gray-900 text-sm">
                  Détail mission #{selected.id}
                </h4>
                <p class="text-[10px] text-gray-400 font-mono mt-1">
                  {selected.agentId} · créée {new Date(selected.createdAt).toLocaleString('fr-FR')} · maj{' '}
                  {new Date(selected.updatedAt).toLocaleString('fr-FR')}
                </p>
              </div>
              <button
                type="button"
                class="shrink-0 text-gray-400 hover:text-gray-700 text-xl leading-none px-2"
                onClick={closeModal}
                aria-label="Fermer"
              >
                ×
              </button>
            </div>

            <div class="px-6 py-4 space-y-4">
              {banner ? (
                <div
                  class={`text-xs p-3 rounded-lg border ${
                    banner.type === 'ok'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {banner.text}
                </div>
              ) : null}

              <div>
                <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Titre / résumé</label>
                <input
                  type="text"
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                  value={editTask}
                  onInput={(e) => setEditTask((e.target as HTMLInputElement).value)}
                />
              </div>

              <div>
                <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Consigne (input)</label>
                <textarea
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 min-h-[120px] font-mono focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                  value={editInput}
                  onInput={(e) => setEditInput((e.target as HTMLTextAreaElement).value)}
                />
              </div>

              <div>
                <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Sortie / résultat</label>
                <textarea
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-800 min-h-[100px] font-mono focus:border-blue-400 focus:ring-1 focus:ring-blue-400 outline-none"
                  value={editOutput}
                  onInput={(e) => setEditOutput((e.target as HTMLTextAreaElement).value)}
                  placeholder="Rempli par l’agent ou à la main…"
                />
              </div>

              <div>
                <label class="block text-[10px] font-bold text-gray-400 uppercase mb-1">Statut</label>
                <select
                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-blue-400 outline-none"
                  value={editStatus}
                  onChange={(e) => setEditStatus((e.target as HTMLSelectElement).value)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <p class="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-[10px] text-amber-900">
                <span class="font-semibold">Forcer la demande</span> exécute titre + consigne via l’orchestrateur Forge
                et met à jour cette tâche avec la réponse de l’agent.
              </p>
            </div>

            <div class="sticky bottom-0 bg-gray-50 border-t border-gray-100 px-6 py-4 flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                class="px-4 py-2 text-sm rounded-lg border border-gray-200 text-gray-700 hover:bg-white"
                onClick={closeModal}
              >
                Fermer
              </button>
              <button
                type="button"
                class="px-4 py-2 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                disabled={forcing}
                onClick={() => void forceDispatch()}
              >
                {forcing ? 'Envoi…' : 'Forcer la demande'}
              </button>
              <button
                type="button"
                class="px-4 py-2 text-sm rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50"
                disabled={deleting}
                onClick={() => void remove()}
              >
                {deleting ? '…' : 'Supprimer'}
              </button>
              <button
                type="button"
                class="px-4 py-2 text-sm rounded-lg bg-[#175B37] text-white hover:opacity-95 disabled:opacity-50"
                disabled={saving}
                onClick={() => void save()}
              >
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
