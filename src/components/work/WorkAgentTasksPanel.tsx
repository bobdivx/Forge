import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';

type TaskRow = {
  id: number;
  agentId: string;
  task: string;
  status: string;
  projectId: number | null;
  createdAt: string;
  updatedAt: string;
};

function updatedAtMs(iso: string | undefined): number {
  if (!iso) return 0;
  const ms = new Date(iso).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function normalizeStatus(s: string): string {
  return String(s || '').toLowerCase();
}

type TaskViewTab = 'active' | 'finished' | 'all';

function statusCls(s: string): string {
  const x = String(s || '').toLowerCase();
  if (x === 'running') return 'bg-emerald-50 text-emerald-700';
  if (x === 'pending' || x === 'bug') return 'bg-amber-50 text-amber-800';
  if (x === 'completed') return 'bg-green-50 text-green-700';
  if (x === 'failed' || x === 'cancelled') return 'bg-rose-50 text-rose-700';
  return 'bg-gray-100 text-gray-600';
}

export default function WorkAgentTasksPanel() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [purgeScope, setPurgeScope] = useState<'pending' | 'finished' | 'all' | null>(null);
  const [taskTab, setTaskTab] = useState<TaskViewTab>('active');

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch('/api/work-tasks-actions?limit=500');
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      setTasks(Array.isArray(data.tasks) ? data.tasks : []);
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : String(e) });
      setTasks([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function postAction(payload: Record<string, unknown>) {
    const res = await fetch('/api/work-tasks-actions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    return data as { message?: string; ok?: boolean };
  }

  async function onDispatchQueue() {
    setBusy('queue');
    setMsg(null);
    try {
      const d = await postAction({ action: 'dispatchQueue' });
      setMsg({ type: 'ok', text: d.message || 'Dispatch lancé.' });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function onDispatchOne(taskId: number) {
    setBusy(`task-${taskId}`);
    setMsg(null);
    try {
      await postAction({ action: 'dispatchTask', taskId });
      setMsg({ type: 'ok', text: `Tâche #${taskId} envoyée vers l’agent.` });
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  async function executePurge() {
    if (!purgeScope) return;
    setBusy('purge');
    setMsg(null);
    try {
      const body: Record<string, unknown> = { action: 'deleteTasks', scope: purgeScope };
      const d = await postAction(body);
      setMsg({ type: 'ok', text: d.message || 'Suppression effectuée.' });
      setPurgeScope(null);
      await load();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }

  const pendingCount = tasks.filter((t) => ['pending', 'bug'].includes(normalizeStatus(t.status))).length;
  const finishedCount = tasks.filter((t) =>
    ['completed', 'failed', 'cancelled'].includes(normalizeStatus(t.status)),
  ).length;

  const activeSorted = useMemo(() => {
    const rank = (status: string) => {
      const s = normalizeStatus(status);
      if (s === 'running') return 0;
      if (s === 'pending' || s === 'bug') return 1;
      return 2;
    };
    return [...tasks]
      .filter((t) => ['pending', 'bug', 'running'].includes(normalizeStatus(t.status)))
      .sort((a, b) => {
        const d = rank(a.status) - rank(b.status);
        if (d !== 0) return d;
        return updatedAtMs(b.updatedAt) - updatedAtMs(a.updatedAt);
      });
  }, [tasks]);

  const finishedSorted = useMemo(
    () =>
      [...tasks]
        .filter((t) => ['completed', 'failed', 'cancelled'].includes(normalizeStatus(t.status)))
        .sort((a, b) => updatedAtMs(b.updatedAt) - updatedAtMs(a.updatedAt)),
    [tasks],
  );

  const allSorted = useMemo(
    () => [...tasks].sort((a, b) => updatedAtMs(b.updatedAt) - updatedAtMs(a.updatedAt)),
    [tasks],
  );

  const displayTasks =
    taskTab === 'active' ? activeSorted : taskTab === 'finished' ? finishedSorted : allSorted;

  const activeTabCount = activeSorted.length;

  return (
    <section class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
      <div class="p-5 border-b border-gray-100 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div class="flex items-center gap-2">
            <div class="w-1 h-6 rounded-full bg-[#175B37]" />
            <h3 class="text-base font-bold text-gray-900">Tâches agents (file d’exécution)</h3>
          </div>
          <p class="text-xs text-gray-500 mt-1 max-w-xl">
            Journal des <code class="text-[11px] bg-gray-100 px-1 rounded">AgentTask</code>. Lancez tout le dispatch
            (comme le scheduler), une tâche précise en file, ou supprimez des lots pour repartir proprement. Le statut
            <strong> completed</strong> signifie que l’agent a terminé une exécution avec une réponse enregistrée — ce
            n’est pas un certificat de correctif fusionné dans le dépôt (voir l’arborescence Git ci-dessus dans le fil
            simple).
          </p>
          {!loading && tasks.length > 0 ? (
            <div class="mt-3 flex flex-wrap gap-2" role="tablist" aria-label="Filtrer les tâches par statut">
              <button
                type="button"
                role="tab"
                aria-selected={taskTab === 'active'}
                onClick={() => setTaskTab('active')}
                class={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                  taskTab === 'active'
                    ? 'bg-[#175B37] text-white shadow-sm'
                    : 'border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                À traiter · {activeTabCount}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={taskTab === 'finished'}
                onClick={() => setTaskTab('finished')}
                class={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                  taskTab === 'finished'
                    ? 'bg-[#175B37] text-white shadow-sm'
                    : 'border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                Terminées · {finishedCount}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={taskTab === 'all'}
                onClick={() => setTaskTab('all')}
                class={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                  taskTab === 'all'
                    ? 'bg-[#175B37] text-white shadow-sm'
                    : 'border border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100'
                }`}
              >
                Toutes · {tasks.length}
              </button>
              <span class="text-[10px] text-gray-400 self-center">
                À traiter : en cours puis file (pending / bug), tri par mise à jour.
              </span>
            </div>
          ) : null}
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || busy !== null}
            onClick={() => void onDispatchQueue()}
            class="rounded-full bg-[#175B37] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 hover:opacity-95"
          >
            {busy === 'queue' ? 'Envoi…' : 'Lancer la file (dispatch)'}
          </button>
          <button
            type="button"
            disabled={loading || busy !== null || pendingCount === 0}
            onClick={() => setPurgeScope('pending')}
            class="rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900 disabled:opacity-50"
          >
            Supprimer la file ({pendingCount})
          </button>
          <button
            type="button"
            disabled={loading || busy !== null || finishedCount === 0}
            onClick={() => setPurgeScope('finished')}
            class="rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 disabled:opacity-50"
          >
            Supprimer terminées ({finishedCount})
          </button>
          <button
            type="button"
            disabled={loading || busy !== null || tasks.length === 0}
            onClick={() => setPurgeScope('all')}
            class="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-50"
          >
            Tout supprimer
          </button>
          <button
            type="button"
            disabled={loading || busy !== null}
            onClick={() => void load()}
            class="rounded-full border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            Actualiser
          </button>
        </div>
      </div>

      {msg ? (
        <div
          class={`mx-5 mt-4 rounded-xl px-3 py-2 text-xs font-medium ${
            msg.type === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-rose-50 text-rose-800'
          }`}
        >
          {msg.text}
        </div>
      ) : null}

      {loading ? (
        <div class="p-10 text-center text-sm text-gray-400">Chargement des tâches…</div>
      ) : tasks.length === 0 ? (
        <div class="p-10 text-center text-sm text-gray-400">Aucune entrée AgentTask en base.</div>
      ) : displayTasks.length === 0 ? (
        <div class="p-10 text-center text-sm text-gray-500">
          {taskTab === 'active'
            ? 'Aucune tâche active (running / pending / bug). Ouvrez l’onglet « Terminées » pour voir l’historique.'
            : taskTab === 'finished'
              ? 'Aucune tâche terminée dans les entrées chargées.'
              : 'Aucune tâche à afficher.'}
        </div>
      ) : (
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-gray-100 bg-gray-50/80">
                <th class="text-[10px] uppercase font-bold text-gray-400 px-4 py-2 text-left">Id</th>
                <th class="text-[10px] uppercase font-bold text-gray-400 px-4 py-2 text-left">Statut</th>
                <th class="text-[10px] uppercase font-bold text-gray-400 px-4 py-2 text-left">Agent</th>
                <th class="text-[10px] uppercase font-bold text-gray-400 px-4 py-2 text-left">Titre</th>
                <th class="text-[10px] uppercase font-bold text-gray-400 px-4 py-2 text-left">Maj</th>
                <th class="text-[10px] uppercase font-bold text-gray-400 px-4 py-2 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {displayTasks.map((t) => {
                const st = String(t.status || '').toLowerCase();
                const canSend = st === 'pending' || st === 'bug';
                const sending = busy === `task-${t.id}`;
                return (
                  <tr key={t.id} class="border-b border-gray-50 hover:bg-gray-50/80">
                    <td class="px-4 py-2 font-mono text-[11px] text-gray-500">#{t.id}</td>
                    <td class="px-4 py-2">
                      <span class={`text-[10px] font-semibold px-2 py-0.5 rounded ${statusCls(t.status)}`}>
                        {t.status}
                      </span>
                    </td>
                    <td class="px-4 py-2 text-[11px] font-mono text-gray-700 max-w-[140px] truncate" title={t.agentId}>
                      {t.agentId}
                    </td>
                    <td class="px-4 py-2 text-xs text-gray-800 max-w-md">
                      <div class="truncate" title={t.task}>
                        {t.task}
                      </div>
                    </td>
                    <td class="px-4 py-2 text-[10px] text-gray-400 whitespace-nowrap">
                      {t.updatedAt
                        ? new Date(t.updatedAt).toLocaleString('fr-FR', {
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                    <td class="px-4 py-2 text-right">
                      <button
                        type="button"
                        disabled={!canSend || busy !== null}
                        onClick={() => void onDispatchOne(t.id)}
                        class="rounded-full bg-[#175B37]/90 px-3 py-1.5 text-[11px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#175B37]"
                      >
                        {sending ? '…' : 'Envoyer'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {purgeScope ? (
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <div class="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h4 class="font-bold text-gray-900">
              {purgeScope === 'pending' && 'Supprimer les tâches en file ?'}
              {purgeScope === 'finished' && 'Supprimer les tâches terminées ?'}
              {purgeScope === 'all' && 'Supprimer toutes les AgentTask ?'}
            </h4>
            <p class="text-sm text-gray-600">
              {purgeScope === 'pending' &&
                `Cela enlève ${pendingCount} entrée(s) au statut pending / bug. Les anomalies carnet ne sont pas modifiées ici.`}
              {purgeScope === 'finished' &&
                `Cela enlève ${finishedCount} entrée(s) completed / failed / cancelled.`}
              {purgeScope === 'all' &&
                'Efface tout le journal des tâches agents. Cette action est irréversible.'}
            </p>
            <div class="flex justify-end gap-2 pt-2">
              <button
                type="button"
                class="rounded-full border border-gray-200 px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                disabled={busy === 'purge'}
                onClick={() => {
                  setPurgeScope(null);
                }}
              >
                Annuler
              </button>
              <button
                type="button"
                class={`rounded-full px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 ${
                  purgeScope === 'all' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-700 hover:bg-amber-800'
                }`}
                disabled={busy === 'purge'}
                onClick={() => void executePurge()}
              >
                {busy === 'purge' ? 'Suppression…' : 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
