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
const POLL_ATTEMPTS = 48; // 48 * 2.5s = ~2 minutes
const POLL_INTERVAL_MS = 2500;

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: string;
  remediation?: GatewayRemediation;
  isAck?: boolean;
};

type RoutingDebugState = {
  requestedSessionKey: string;
  routedSessionKey: string;
  polledSessionKey: string;
  selectedSessionKey: string;
  via: string;
  lastReason: string;
};

type GatewayRemediation = {
  title?: string;
  endpoint?: string;
  endpointMethod?: string;
  where?: string;
  configPath?: string;
  instructions?: unknown;
  json?: string;
  curlTest?: string;
  powershellScript?: string;
  bashScript?: string;
  openclawPrompt?: string;
  docs?: string;
};

function formatGatewayRemediation(remediation: GatewayRemediation | undefined): string {
  if (!remediation || typeof remediation !== 'object') return '';
  const lines: string[] = [];
  const title = typeof remediation.title === 'string' ? remediation.title.trim() : '';
  const endpoint = typeof remediation.endpoint === 'string' ? remediation.endpoint.trim() : '';
  const endpointMethod = typeof remediation.endpointMethod === 'string' ? remediation.endpointMethod.trim() : '';
  const where = typeof remediation.where === 'string' ? remediation.where.trim() : '';
  const configPath = typeof remediation.configPath === 'string' ? remediation.configPath.trim() : '';
  const json = typeof remediation.json === 'string' ? remediation.json.trim() : '';
  const curlTest = typeof remediation.curlTest === 'string' ? remediation.curlTest.trim() : '';
  const powershellScript =
    typeof remediation.powershellScript === 'string' ? remediation.powershellScript.trim() : '';
  const bashScript = typeof remediation.bashScript === 'string' ? remediation.bashScript.trim() : '';
  const openclawPrompt =
    typeof remediation.openclawPrompt === 'string' ? remediation.openclawPrompt.trim() : '';
  const docs = typeof remediation.docs === 'string' ? remediation.docs.trim() : '';
  const instructionsRaw = Array.isArray(remediation.instructions) ? remediation.instructions : [];
  const instructions = instructionsRaw
    .map((step) => (typeof step === 'string' ? step.trim() : ''))
    .filter(Boolean);

  if (title) lines.push(`Action requise: ${title}`);
  if (endpoint) lines.push(`Endpoint exact Forge -> OpenClaw: ${endpoint}`);
  if (endpointMethod) lines.push(`Methode attendue: ${endpointMethod}`);
  if (where) lines.push(`Ou le mettre: ${where}`);
  if (configPath) lines.push(`Chemin de fichier detecte: ${configPath}`);
  if (instructions.length > 0) {
    lines.push('Etapes:');
    instructions.forEach((step, index) => lines.push(`${index + 1}. ${step}`));
  }
  if (json) {
    lines.push('JSON a copier-coller:');
    lines.push(json);
  }
  if (curlTest) {
    lines.push('Test API (POST) a executer:');
    lines.push(curlTest);
  }
  if (powershellScript) {
    lines.push('Script auto (PowerShell) :');
    lines.push(powershellScript);
  }
  if (bashScript) {
    lines.push('Script auto (bash/python) :');
    lines.push(bashScript);
  }
  if (openclawPrompt) {
    lines.push('Prompt a donner a OpenClaw :');
    lines.push(openclawPrompt);
  }
  if (docs) lines.push(`Documentation: ${docs}`);

  return lines.join('\n');
}

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
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [pollingReply, setPollingReply] = useState(false);
  const [routingDebug, setRoutingDebug] = useState<RoutingDebugState | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  const copyToClipboard = async (text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('Copié dans le presse-papiers.');
      setTimeout(() => setCopyFeedback(null), 1800);
    } catch {
      setError('Copie impossible automatiquement. Sélectionnez et copiez manuellement.');
    }
  };

  const pollAssistantReply = async (sessionKey: string, afterMs: number) => {
    setPollingReply(true);
    try {
      let lastReason = '';
      for (let i = 0; i < POLL_ATTEMPTS; i += 1) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        const res = await fetch('/api/discussion-poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionKey, afterMs }),
        });
        const data = await res.json().catch(() => ({}));
        lastReason = typeof data.reason === 'string' ? data.reason : lastReason;
        const selectedSessionKey =
          typeof data.selectedSessionKey === 'string' ? data.selectedSessionKey.trim() : '';
        setRoutingDebug((prev) =>
          prev
            ? {
                ...prev,
                selectedSessionKey: selectedSessionKey || prev.selectedSessionKey,
                lastReason,
              }
            : prev,
        );
        const reply = typeof data.reply === 'string' ? data.reply.trim() : '';
        if (reply) {
          if (selectedSessionKey) {
            setRoutingDebug((prev) =>
              prev
                ? {
                    ...prev,
                    selectedSessionKey,
                    lastReason: '',
                  }
                : prev,
            );
          }
          setChat((c) => {
            const next = [...c];
            for (let j = next.length - 1; j >= 0; j -= 1) {
              if (next[j].isAck) {
                next[j] = {
                  ...next[j],
                  role: 'assistant',
                  isAck: false,
                  text: reply.slice(0, 8000),
                };
                return next;
              }
            }
            next.push({
              id: `${Date.now()}-ap`,
              role: 'assistant',
              text: reply.slice(0, 8000),
              at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            });
            return next;
          });
          return;
        }
      }
      const reasonLabel =
        lastReason === 'session_non_trouvee'
          ? "session non trouvée"
          : lastReason === 'pas_de_reponse_assistant'
            ? 'pas encore de message assistant'
            : lastReason === 'session_sans_messages'
              ? 'session sans messages'
              : lastReason || 'en attente prolongée';
      setChat((c) =>
        c.map((m) =>
          m.isAck
            ? {
                ...m,
                text: `Message transmis. Réponse toujours en attente (${reasonLabel}).`,
              }
            : m,
        ),
      );
      setRoutingDebug((prev) => (prev ? { ...prev, lastReason } : prev));
    } catch {
      setChat((c) =>
        c.map((m) =>
          m.isAck
            ? {
                ...m,
                text: "Message transmis. Impossible de récupérer la réponse en direct pour l'instant.",
              }
            : m,
        ),
      );
    } finally {
      setPollingReply(false);
    }
  };

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
  const selectedProject = useMemo(
    () => (projectIdNum != null && !Number.isNaN(projectIdNum) ? projects.find((p) => p.id === projectIdNum) : undefined),
    [projects, projectIdNum],
  );

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
    const sentAtMs = Date.now();
    const now = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const userBubble: ChatMessage = {
      id: `${Date.now()}-u`,
      role: 'user',
      text: msg,
      at: now,
    };
    setChat((c) => [...c, userBubble]);
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
        const baseErr = typeof data.error === 'string' ? data.error : 'Échec envoi vers le gateway';
        const remediation = data.remediation as GatewayRemediation | undefined;
        setError(baseErr);
        setChat((c) => {
          const next: ChatMessage[] = [
            ...c,
            {
              id: `${Date.now()}-e`,
              role: 'system',
              text: baseErr,
              at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            },
          ];
          if (remediation) {
            next.push({
              id: `${Date.now()}-guide`,
              role: 'system',
              text: 'Je peux te guider pas à pas. Choisis une méthode ci-dessous : JSON, PowerShell, ou bash/python.',
              remediation,
              at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            });
          }
          return next;
        });
        return;
      }
      const result = data.result as Record<string, unknown> | undefined;
      const reply = result && typeof result.reply === 'string' ? result.reply : '';
      const deliveryAck = typeof data.delivery === 'string' ? data.delivery : '';
      const status = result && typeof result.status === 'string' ? result.status.toLowerCase() : '';
      const via = typeof data.via === 'string' ? data.via : '';
      const routedSessionKey =
        typeof data.routedSessionKey === 'string' && data.routedSessionKey.trim()
          ? data.routedSessionKey.trim()
          : typeof data.sessionKeyResolved === 'string' && data.sessionKeyResolved.trim()
            ? data.sessionKeyResolved.trim()
            : agentId;
      const assistantText =
        reply && reply.trim()
          ? reply.slice(0, 8000)
          : deliveryAck && deliveryAck.trim()
            ? deliveryAck.trim()
            : status === 'accepted' || status === 'queued' || status === 'running'
              ? `Message transmis a l'agent${via ? ` (${via})` : ''}. Reponse en cours...`
              : 'Message transmis a l’agent. Reponse non immediate.';
      setChat((c) => [
        ...c,
        {
          id: `${Date.now()}-a`,
          role: 'assistant',
          text: assistantText,
          at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
          isAck: !reply?.trim(),
        },
      ]);
      if (!reply?.trim()) {
        const pollSessionKey = routedSessionKey;
        setRoutingDebug({
          requestedSessionKey: agentId,
          routedSessionKey,
          polledSessionKey: pollSessionKey,
          selectedSessionKey: '',
          via,
          lastReason: '',
        });
        void pollAssistantReply(pollSessionKey, sentAtMs);
      } else {
        setRoutingDebug({
          requestedSessionKey: agentId,
          routedSessionKey,
          polledSessionKey: '',
          selectedSessionKey: '',
          via,
          lastReason: '',
        });
      }
      setMessage('');
    } catch {
      setError('Erreur réseau.');
      setChat((c) => [
        ...c,
        {
          id: `${Date.now()}-e2`,
          role: 'system',
          text: 'Erreur réseau',
          at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const usableAgents = agents.filter(isSessionUsable);
  const offlineCount = agents.length - usableAgents.length;
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat, sending, pollingReply]);

  if (loading) {
    return <div class="animate-pulse text-gray-400 py-12 text-center text-sm">Chargement du contexte…</div>;
  }

  return (
    <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6">
      <div class="lg:col-span-4 bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-6 space-y-6">
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
        </div>

        {error && (
          <div class="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">{error}</div>
        )}
        {copyFeedback && (
          <div class="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3">
            {copyFeedback}
          </div>
        )}
      </div>

      <div class="lg:col-span-8 bg-white rounded-[1.5rem] border border-gray-100 shadow-sm p-0 flex flex-col min-h-[70vh] max-h-[78vh] overflow-hidden">
        <div class="px-5 py-4 border-b border-gray-100 bg-gray-50/70">
          <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Chat Discussion</p>
          <p class="text-xs text-gray-500 mt-1">
            Conversation directe avec l’agent sélectionné (style chat DaisyUI).
          </p>
          {(selectedAgent || selectedProject || selectedRequest) && (
            <div class="mt-2 flex flex-wrap gap-1.5">
              {selectedAgent && <span class="badge badge-outline badge-sm">Agent: {selectedAgent.name}</span>}
              {selectedProject && <span class="badge badge-outline badge-sm">Projet: {selectedProject.name}</span>}
              {selectedRequest && <span class="badge badge-outline badge-sm">Demande: #{selectedRequest.id}</span>}
            </div>
          )}
          {routingDebug && (
            <details class="mt-3 rounded-lg border border-gray-200 bg-white px-3 py-2 text-[11px] text-gray-600">
              <summary class="cursor-pointer font-semibold text-gray-700">Debug routage session</summary>
              <div class="mt-2 space-y-1 font-mono break-all">
                <p>Demandée: {routingDebug.requestedSessionKey || 'n/a'}</p>
                <p>Routée API: {routingDebug.routedSessionKey || 'n/a'}</p>
                <p>Pollée: {routingDebug.polledSessionKey || 'n/a'}</p>
                <p>Lue par poll: {routingDebug.selectedSessionKey || 'n/a'}</p>
                <p>Via: {routingDebug.via || 'n/a'}</p>
                <p>Raison pending: {routingDebug.lastReason || 'n/a'}</p>
              </div>
            </details>
          )}
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          {chat.length === 0 && (
            <div class="text-sm text-gray-400 text-center py-12">
              Aucun message pour le moment. Saisissez une question ci-dessous.
            </div>
          )}
          {chat.map((m) => (
            <div key={m.id} class={`chat ${m.role === 'user' ? 'chat-end' : 'chat-start'}`}>
              <div class="chat-header text-[10px] text-gray-400 mb-1">
                {m.role === 'user' ? 'Vous' : m.role === 'assistant' ? 'Agent' : 'Système'} · {m.at}
              </div>
              <div
                class={`chat-bubble whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'chat-bubble-success text-white'
                    : m.role === 'assistant'
                      ? m.isAck
                        ? 'chat-bubble-info text-white'
                        : 'chat-bubble-neutral text-white'
                      : 'chat-bubble-warning text-gray-900'
                }`}
              >
                {m.text}
                {m.remediation && (
                  <div class="mt-3 space-y-2 text-xs">
                    <div class="flex flex-wrap gap-2">
                      <button
                        type="button"
                        class="btn btn-xs btn-outline"
                        onClick={() => {
                          setMessage('Je choisis la méthode JSON. Donne-moi les étapes minimales.');
                          void copyToClipboard(m.remediation?.json || '');
                        }}
                      >
                        Choisir JSON
                      </button>
                      <button
                        type="button"
                        class="btn btn-xs btn-outline"
                        onClick={() => {
                          setMessage('Je choisis la méthode PowerShell. Guide-moi.');
                          void copyToClipboard(m.remediation?.powershellScript || '');
                        }}
                      >
                        Choisir PowerShell
                      </button>
                      <button
                        type="button"
                        class="btn btn-xs btn-outline"
                        onClick={() => {
                          setMessage('Je choisis la méthode bash/python. Guide-moi.');
                          void copyToClipboard(m.remediation?.bashScript || '');
                        }}
                      >
                        Choisir bash/python
                      </button>
                    </div>

                    <details class="bg-white/70 rounded-md p-2">
                      <summary class="cursor-pointer font-semibold">Infos rapides</summary>
                      <div class="mt-2 whitespace-pre-wrap">
                        {formatGatewayRemediation({
                          title: m.remediation.title,
                          endpoint: m.remediation.endpoint,
                          endpointMethod: m.remediation.endpointMethod,
                          configPath: m.remediation.configPath,
                          docs: m.remediation.docs,
                        })}
                      </div>
                    </details>

                    <details class="bg-white/70 rounded-md p-2">
                      <summary class="cursor-pointer font-semibold">Voir JSON</summary>
                      <div class="mt-2">
                        <button
                          type="button"
                          class="btn btn-xs btn-outline"
                          onClick={() => void copyToClipboard(m.remediation?.json || '')}
                        >
                          Copier JSON
                        </button>
                      </div>
                      <pre class="mt-2 whitespace-pre-wrap">{m.remediation.json || ''}</pre>
                    </details>
                    <details class="bg-white/70 rounded-md p-2">
                      <summary class="cursor-pointer font-semibold">Voir script PowerShell</summary>
                      <div class="mt-2">
                        <button
                          type="button"
                          class="btn btn-xs btn-outline"
                          onClick={() => void copyToClipboard(m.remediation?.powershellScript || '')}
                        >
                          Copier script PowerShell
                        </button>
                      </div>
                      <pre class="mt-2 whitespace-pre-wrap">{m.remediation.powershellScript || ''}</pre>
                    </details>
                    <details class="bg-white/70 rounded-md p-2">
                      <summary class="cursor-pointer font-semibold">Voir script bash/python</summary>
                      <div class="mt-2">
                        <button
                          type="button"
                          class="btn btn-xs btn-outline"
                          onClick={() => void copyToClipboard(m.remediation?.bashScript || '')}
                        >
                          Copier script bash/python
                        </button>
                      </div>
                      <pre class="mt-2 whitespace-pre-wrap">{m.remediation.bashScript || ''}</pre>
                    </details>
                    <details class="bg-white/70 rounded-md p-2">
                      <summary class="cursor-pointer font-semibold">Prompt à donner à OpenClaw</summary>
                      <div class="mt-2">
                        <button
                          type="button"
                          class="btn btn-xs btn-outline"
                          onClick={() => void copyToClipboard(m.remediation?.openclawPrompt || '')}
                        >
                          Copier prompt OpenClaw
                        </button>
                      </div>
                      <pre class="mt-2 whitespace-pre-wrap">{m.remediation.openclawPrompt || ''}</pre>
                    </details>
                    <details class="bg-white/70 rounded-md p-2">
                      <summary class="cursor-pointer font-semibold">Voir test API (POST)</summary>
                      <div class="mt-2">
                        <button
                          type="button"
                          class="btn btn-xs btn-outline"
                          onClick={() => void copyToClipboard(m.remediation?.curlTest || '')}
                        >
                          Copier test POST
                        </button>
                      </div>
                      <pre class="mt-2 whitespace-pre-wrap">{m.remediation.curlTest || ''}</pre>
                    </details>
                  </div>
                )}
              </div>
            </div>
          ))}
          {(sending || pollingReply) && (
            <div class="chat chat-start">
              <div class="chat-header text-[10px] text-gray-400 mb-1">
                Agent · {sending ? 'envoi' : 'réponse en cours'}
              </div>
              <div class="chat-bubble chat-bubble-neutral text-white">
                <span class="loading loading-dots loading-xs" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        <div class="border-t border-gray-100 p-4 bg-white">
          <div class="join w-full">
            <textarea
              class="textarea textarea-bordered join-item w-full min-h-[84px]"
              placeholder="Ex. : Résume l’état du correctif pour la demande ci-dessus…"
              value={message}
              onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
              disabled={sending}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending || !message.trim() || !agentId}
              class="btn btn-success join-item self-stretch rounded-l-none"
            >
              {sending ? 'Envoi…' : 'Envoyer'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
