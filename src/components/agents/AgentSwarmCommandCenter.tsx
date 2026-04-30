import { useCallback, useEffect, useState } from 'preact/hooks';

type ZimaOSMsg = { role: string; preview: string; at: string };
type ZimaOSPanel = {
  matched: boolean;
  sessionKey: string | null;
  status: string | null;
  model: string | null;
  lastSeen: string | null;
  messages: ZimaOSMsg[];
};
type MissionTask = {
  id: number;
  agentId: string;
  task: string;
  input: string | null;
  output: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
};

type PanelPayload = {
  ok?: boolean;
  error?: string;
  gatewayError?: string | null;
  zimaos?: ZimaOSPanel;
  buckets?: { running: MissionTask[]; pending: MissionTask[]; recentDone: MissionTask[] };
};

function badgeClass(status: string) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'success' || s === 'completed' || s === 'resolved') return 'bg-emerald-50 text-emerald-700';
  if (s === 'running' || s === 'in_progress') return 'bg-blue-50 text-blue-700';
  if (s === 'error' || s === 'failed' || s === 'bug') return 'bg-red-50 text-red-600';
  if (s === 'pending') return 'bg-amber-50 text-amber-800';
  return 'bg-gray-100 text-gray-600';
}

function roleLabel(role: string) {
  const r = String(role || '').toLowerCase();
  if (r === 'assistant' || r === 'agent') return 'Assistant';
  if (r === 'user' || r === 'human') return 'Vous / orchestration';
  if (r === 'system') return 'Système';
  return role || 'Message';
}

type Props = {
  agentId: string;
  /** Clé d'accès si connue. */
  sessionKey: string;
};

export default function AgentSwarmCommandCenter({ agentId, sessionKey }: Props) {
  const [panel, setPanel] = useState<PanelPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [instruction, setInstruction] = useState('');
  const [sendNow, setSendNow] = useState(true);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const load = useCallback(() => {
    const q = encodeURIComponent(agentId);
    return fetch(`/api/swarm-agent-panel?agentId=${q}`)
      .then((r) => r.json() as Promise<PanelPayload>)
      .then(setPanel)
      .catch(() => setPanel({ error: 'Chargement impossible' }));
  }, [agentId]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => {
      if (!cancelled) setLoading(false);
    });
    const t = setInterval(() => {
      void load();
    }, 14_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [load]);

  useEffect(() => {
    const onRefresh = (e: Event) => {
      const d = (e as CustomEvent<{ agentId?: string }>).detail;
      if (d?.agentId && d.agentId !== agentId) return;
      void load();
    };
    window.addEventListener('forge-swarm-refresh', onRefresh as EventListener);
    return () => window.removeEventListener('forge-swarm-refresh', onRefresh as EventListener);
  }, [agentId, load]);

  const oc = panel?.zimaos;
  const buckets = panel?.buckets ?? { running: [], pending: [], recentDone: [] };
  const lastAssistant = [...(oc?.messages ?? [])].reverse().find((m) => {
    const r = String(m.role || '').toLowerCase();
    return r === 'assistant' || r === 'agent';
  });

  const createMission = async () => {
    const t = title.trim();
    const ins = instruction.trim();
    if (!t) {
      setBanner({ type: 'err', text: 'Indiquez un titre de mission.' });
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/agent-tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          task: t,
          input: ins || undefined,
          status: 'pending',
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; task?: MissionTask };
      if (!res.ok) {
        setBanner({ type: 'err', text: data.error || 'Création refusée' });
        return;
      }
      const taskRow = data.task;
      let dispatchErr: string | null = null;
      if (sendNow && taskRow?.id) {
        // Envoi interne Forge Orchestrator (pas ZimaOS Gateway)
        const rd = await fetch('/api/agent-task-redispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId: taskRow.id }),
        });
        const rdJson = (await rd.json().catch(() => ({}))) as { error?: string };
        if (!rd.ok) dispatchErr = rdJson.error || `Erreur d'orchestration HTTP ${rd.status}`;
      }
      setTitle('');
      setInstruction('');
      setBanner({
        type: dispatchErr ? 'err' : 'ok',
        text: dispatchErr
          ? `Mission créée (#${taskRow?.id}) — ${dispatchErr}`
          : sendNow
            ? `Mission #${taskRow?.id} créée et envoyée à l’orchestrateur.`
            : `Mission #${taskRow?.id} enregistrée (brouillon).`,
      });
      window.dispatchEvent(new CustomEvent('forge-swarm-refresh', { detail: { agentId } }));
    } catch {
      setBanner({ type: 'err', text: 'Erreur réseau' });
    } finally {
      setBusy(false);
    }
  };

  if (loading && !panel) {
    return (
      <div class="rounded-[1.5rem] border border-gray-100 bg-white p-8 text-center text-sm text-gray-400 shadow-sm animate-pulse">
        Chargement de l’activité…
      </div>
    );
  }

  return (
    <div class="space-y-4">
      <div class="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* En cours */}
        <div class="rounded-[1.5rem] border border-gray-100 bg-white p-5 shadow-sm space-y-3">
          <div class="flex items-center gap-2">
            <span class="h-2 w-2 rounded-full bg-blue-500 animate-pulse" aria-hidden />
            <h2 class="text-sm font-bold text-gray-900">En ce moment</h2>
          </div>
          {oc?.matched ? (
            <p class="text-[11px] text-gray-500">
              Statut Core :{' '}
              <span class={`font-semibold ${oc.status === 'actif' ? 'text-emerald-600' : 'text-gray-500'}`}>
                {oc.status === 'actif' ? 'opérationnel' : 'en pause'}
              </span>
              {oc.model ? (
                <>
                  {' '}
                  · modèle <span class="font-mono text-blue-600">{String(oc.model).split('/').pop()}</span>
                </>
              ) : null}
            </p>
          ) : (
            <p class="text-xs text-gray-500">Agent non initialisé ou désactivé.</p>
          )}
          {buckets.running.length > 0 ? (
            <ul class="space-y-2">
              {buckets.running.map((x) => (
                <li key={x.id} class="rounded-lg border border-blue-100 bg-blue-50/50 px-3 py-2 text-xs text-gray-800">
                  <span class={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${badgeClass(x.status)}`}>
                    {x.status}
                  </span>
                  <span class="font-medium">{x.task}</span>
                  {x.input ? <p class="mt-1 font-mono text-[10px] text-gray-500 line-clamp-3">{x.input}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p class="text-xs text-gray-400 italic">Aucune mission « en cours ».</p>
          )}
          {lastAssistant?.preview ? (
            <div class="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
              <p class="text-[10px] font-bold uppercase text-gray-400 mb-1">Dernière activité</p>
              <p class="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">{lastAssistant.preview}</p>
            </div>
          ) : null}
        </div>

        {/* Historique récent */}
        <div class="rounded-[1.5rem] border border-gray-100 bg-white p-5 shadow-sm space-y-3">
          <h2 class="text-sm font-bold text-gray-900">Historique récent</h2>
          <p class="text-[11px] text-gray-500">Missions terminées ou closes (Astro DB).</p>
          {buckets.recentDone.length > 0 ? (
            <ul class="max-h-56 overflow-y-auto space-y-2 pr-1">
              {buckets.recentDone.map((x) => (
                <li key={x.id} class="rounded-lg border border-gray-100 px-3 py-2 text-xs">
                  <span class={`mr-2 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${badgeClass(x.status)}`}>
                    {x.status}
                  </span>
                  <span class="text-gray-800 font-medium">{x.task}</span>
                  <p class="text-[10px] text-gray-400 mt-0.5">
                    {new Date(x.updatedAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </p>
                </li>
              ))}
            </ul>
          ) : (
            <p class="text-xs text-gray-400 italic">Pas encore de missions terminées pour cet agent.</p>
          )}
          {(oc?.messages?.length ?? 0) > 0 ? (
            <div class="border-t border-gray-100 pt-3 space-y-2 max-h-48 overflow-y-auto">
              <p class="text-[10px] font-bold uppercase text-gray-400">Journal d'activité</p>
              {oc!.messages.slice(-12).map((m, i) => (
                <div key={`${m.at}-${i}`} class="rounded border border-gray-50 bg-gray-50/80 px-2 py-1.5">
                  <div class="flex justify-between gap-2 text-[10px] text-gray-400 font-mono">
                    <span class="font-semibold text-gray-600">{roleLabel(m.role)}</span>
                    <span>{new Date(m.at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  {m.preview ? (
                    <p class="text-[11px] text-gray-700 mt-1 whitespace-pre-wrap line-clamp-4">{m.preview}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Nouvelle mission */}
        <div class="rounded-[1.5rem] border border-[#175B37]/20 bg-[#f6faf7] p-5 shadow-sm space-y-3">
          <h2 class="text-sm font-bold text-gray-900">Mettre au travail</h2>
          <p class="text-[11px] text-gray-600">
            Crée une mission dans le journal Forge et lance l'exécution immédiate via l'orchestrateur.
          </p>
          <label class="block">
            <span class="text-[10px] font-bold uppercase text-gray-400">Titre</span>
            <input
              class="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none focus:border-[#175B37]/50 focus:ring-2 focus:ring-[#175B37]/15"
              value={title}
              onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
              placeholder="Ex. : Audit des routes API…"
              disabled={busy}
            />
          </label>
          <label class="block">
            <span class="text-[10px] font-bold uppercase text-gray-400">Consigne détaillée</span>
            <textarea
              class="mt-1 w-full min-h-[100px] rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 font-mono outline-none focus:border-[#175B37]/50 focus:ring-2 focus:ring-[#175B37]/15"
              value={instruction}
              onInput={(e) => setInstruction((e.target as HTMLTextAreaElement).value)}
              placeholder="Contexte, livrables attendus, contraintes…"
              disabled={busy}
            />
          </label>
          <label class="flex items-center gap-2 text-xs text-gray-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sendNow}
              onChange={(e) => setSendNow((e.target as HTMLInputElement).checked)}
              disabled={busy}
            />
            Démarrer l'exécution immédiatement
          </label>
          {banner ? (
            <div
              class={`text-xs p-3 rounded-lg border ${
                banner.type === 'ok'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {banner.text}
            </div>
          ) : null}
          <button
            type="button"
            class="w-full rounded-xl bg-[#175B37] px-4 py-2.5 text-sm font-semibold text-white shadow hover:opacity-95 disabled:opacity-50"
            disabled={busy}
            onClick={() => void createMission()}
          >
            {busy ? 'Envoi…' : 'Créer la mission'}
          </button>
          {buckets.pending.length > 0 ? (
            <p class="text-[10px] text-amber-800">
              {buckets.pending.length} mission(s) en attente — ouvrez le journal pour relancer.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
