import { useState, useEffect, useMemo, useRef } from 'preact/hooks';

type Project = { id: number; name: string; path: string; status: string | null };
type RequestItem = {
  id: number;
  projectId: number | null;
  projectName: string | null;
  title: string;
  content: string;
  status: string;
  requestType: string | null;
  createdAt: string;
};
type AgentRow = { id: string; name: string; status: string; model: string; raw?: { offline?: boolean; disabledInDb?: boolean } };

const inputCls =
  'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none';

function isSessionUsable(a: AgentRow): boolean {
  if (a.raw?.disabledInDb) return false;
  if (a.raw?.offline) return false;
  // "en veille" peut quand même accepter un sessions_send ; on exclut seulement
  // les états explicitement non exploitables.
  return !/désactivé/i.test(a.status);
}

export default function DiscussionComposer() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [projectId, setProjectId] = useState<string>('');
  const [requestId, setRequestId] = useState<string>('');
  const [agentId, setAgentId] = useState<string>('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResponse, setLastResponse] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      try {
        const [ctxRes, agRes] = await Promise.all([fetch('/api/discussion-context'), fetch('/api/agents')]);
        const ctx = await ctxRes.json();
        const ag = await agRes.json();
        if (cancel) return;
        if (Array.isArray(ctx.projects)) setProjects(ctx.projects);
        if (Array.isArray(ctx.requests)) setRequests(ctx.requests);
        if (Array.isArray(ag.agents)) {
          setAgents(ag.agents);
          const actives = (ag.agents as AgentRow[]).filter(isSessionUsable);
          if (actives.length === 1) setAgentId(actives[0].id);
        }
      } catch {
        if (!cancel) setError('Impossible de charger le contexte ou les agents.');
      } finally {
        if (!cancel) setLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, []);

  const projectIdNum = projectId ? parseInt(projectId, 10) : null;
  const filteredRequests = useMemo(() => {
    if (projectIdNum == null || Number.isNaN(projectIdNum)) return requests;
    return requests.filter((r) => r.projectId === projectIdNum);
  }, [requests, projectIdNum]);

  const prevPid = useRef(projectId);
  useEffect(() => {
    if (prevPid.current === projectId) return;
    prevPid.current = projectId;
    const rid = requestId ? parseInt(requestId, 10) : NaN;
    if (!Number.isFinite(rid)) return;
    const stillVisible = filteredRequests.some((r) => r.id === rid);
    if (!stillVisible) setRequestId('');
  }, [projectId, filteredRequests, requestId]);

  const selectedRequest = useMemo(
    () => (requestId ? requests.find((r) => r.id === parseInt(requestId, 10)) : undefined),
    [requests, requestId],
  );
  const selectedAgent = useMemo(() => agents.find((a) => a.id === agentId), [agents, agentId]);

  const send = async () => {
    const msg = message.trim();
    if (!msg) {
      setError('Saisissez un message.');
      return;
    }
    if (!agentId) {
      setError('Choisissez un agent (session OpenClaw disponible).');
      return;
    }
    setSending(true);
    setError(null);
    setLastResponse(null);
    try {
      const blocks: string[] = [];
      if (selectedRequest) {
        blocks.push(
          `[Contexte Forge — demande #${selectedRequest.id}${selectedRequest.projectName ? ` (${selectedRequest.projectName})` : ''}]\n` +
            `Titre : ${selectedRequest.title}\n` +
            `Statut : ${selectedRequest.status}\n` +
            (selectedRequest.requestType ? `Type : ${selectedRequest.requestType}\n` : '') +
            `\n${selectedRequest.content}`,
        );
      } else if (projectIdNum != null && !Number.isNaN(projectIdNum)) {
        const p = projects.find((x) => x.id === projectIdNum);
        if (p) {
          blocks.push(`[Contexte Forge — projet sélectionné : ${p.name}]\nChemin : ${p.path}`);
        }
      }
      blocks.push(msg);
      const composed = blocks.join('\n\n---\n\n');

      const res = await fetch('/api/openclaw-directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey: agentId, message: composed, timeoutSeconds: 180 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === 'string' ? data.error : 'Échec envoi vers le gateway');
        return;
      }
      const result = data.result as Record<string, unknown> | undefined;
      const reply = result && typeof result.reply === 'string' ? result.reply : '';
      if (reply) {
        setLastResponse(reply.slice(0, 8000));
      } else {
        setLastResponse('Message envoyé. Réponse synchrone vide — vérifiez la session OpenClaw.');
      }
    } catch {
      setError('Erreur réseau.');
    } finally {
      setSending(false);
    }
  };

  const usableAgents = agents.filter(isSessionUsable);
  const offlineCount = agents.length - usableAgents.length;

  if (loading) {
    return <div class="animate-pulse text-gray-400 py-12 text-center text-sm">Chargement du contexte…</div>;
  }

  return (
    <div class="max-w-3xl mx-auto space-y-8">
      <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-6 space-y-6">
        <div>
          <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            Application (optionnel)
          </label>
          <select class={inputCls} value={projectId} onChange={(e) => setProjectId((e.target as HTMLSelectElement).value)}>
            <option value="">— Aucune —</option>
            {projects.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.name}
              </option>
            ))}
          </select>
          <p class="text-[11px] text-gray-400 mt-1.5">Limite les demandes listées ci-dessous au projet choisi.</p>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            Demande / carte carnet (optionnel)
          </label>
          <select
            class={inputCls}
            value={requestId}
            onChange={(e) => setRequestId((e.target as HTMLSelectElement).value)}
            disabled={filteredRequests.length === 0}
          >
            <option value="">— Aucune —</option>
            {filteredRequests.map((r) => (
              <option key={r.id} value={String(r.id)}>
                #{r.id} · {r.title.slice(0, 72)}
                {r.projectName ? ` (${r.projectName})` : ''}
              </option>
            ))}
          </select>
          <p class="text-[11px] text-gray-400 mt-1.5">
            Les {filteredRequests.length} entrée(s) récentes en base Forge sont proposées ici (max. 200).
          </p>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
            Agent / session OpenClaw <span class="text-red-400">*</span>
          </label>
          <select class={inputCls} value={agentId} onChange={(e) => setAgentId((e.target as HTMLSelectElement).value)}>
            <option value="">— Choisir —</option>
            {usableAgents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.status}
              </option>
            ))}
          </select>
          {usableAgents.length === 0 && (
            <p class="text-xs text-amber-700 mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Aucune session exploitable détectée. Vérifiez le gateway dans Paramètres, le nom du conteneur OpenClaw,
              puis rechargez. Les sessions « en veille » sont autorisées ; seuls les agents désactivés/offline sont exclus.
            </p>
          )}
          {usableAgents.length > 0 && offlineCount > 0 && (
            <p class="text-[11px] text-gray-500 mt-2">
              {usableAgents.length} session(s) exploitable(s), {offlineCount} hors ligne/désactivée(s).
            </p>
          )}
          {selectedAgent && (
            <p class="text-[11px] font-mono text-gray-500 mt-2 break-all">
              Clé session : {selectedAgent.id}
            </p>
          )}
          {usableAgents.length > 0 && offlineCount > 0 && (
            <p class="text-[11px] text-gray-500 mt-2">
              {offlineCount} agent(s) désactivé(s) / offline masqué(s) de la liste.
            </p>
          )}
        </div>

        <div>
          <label class="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Votre message</label>
          <textarea
            class={`${inputCls} min-h-[160px] resize-y`}
            placeholder="Ex. : Résume l’état du correctif pour la demande ci-dessus…"
            value={message}
            onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
            disabled={sending}
          />
        </div>

        {error && (
          <div class="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>
        )}

        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || !message.trim() || !agentId}
          class="w-full py-3 rounded-xl font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: '#175B37' }}
        >
          {sending ? 'Envoi…' : 'Envoyer au gateway OpenClaw'}
        </button>
      </div>

      {lastResponse && (
        <div class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-6">
          <h3 class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Réponse (extrait)</h3>
          <pre class="text-sm text-gray-700 whitespace-pre-wrap font-sans bg-gray-50 rounded-xl p-4 max-h-[480px] overflow-y-auto border border-gray-100">
            {lastResponse}
          </pre>
        </div>
      )}
    </div>
  );
}
