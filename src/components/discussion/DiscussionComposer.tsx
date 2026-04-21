import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
import {
  buildAgentTeamProfile,
  mergeOpenClawTeamProfile,
  type AgentTeamProfile,
  type OpenClawAgentProfileRow,
} from '../../lib/agent-profile';
import TeamAvatar from '../agents/TeamAvatar';
import NotificationBellIcon from '../icons/NotificationBellIcon';
import {
  buildSwarmWorkDirective,
  SWARM_WORK_COMMAND_LABELS,
  type SwarmWorkCommand,
} from '../../lib/forge-agent-protocol';

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
  'w-full rounded-2xl border border-gray-200 bg-gray-50/80 px-3.5 py-2.5 text-sm text-gray-900 shadow-inner shadow-white/40 outline-none transition focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20';

function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [routingDebug, setRoutingDebug] = useState<RoutingDebugState | null>(null);
  const [sessionQuery, setSessionQuery] = useState('');
  const [sessionSheetOpen, setSessionSheetOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadByAgent, setUnreadByAgent] = useState<Record<string, number>>({});
  const [ocProfiles, setOcProfiles] = useState<Record<string, OpenClawAgentProfileRow>>({});
  const [profileDraft, setProfileDraft] = useState({
    displayName: '',
    roleTitle: '',
    bio: '',
    avatarUrl: '',
    avatarEmoji: '',
  });
  const [profileSaving, setProfileSaving] = useState(false);
  const [swarmCommandMode, setSwarmCommandMode] = useState<'direct' | 'leader'>('direct');
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const historyLoadGen = useRef(0);
  const currentAgentRef = useRef<string>('');

  const incrementUnread = (sid: string, amount = 1) => {
    if (!sid) return;
    setUnreadByAgent((prev) => ({ ...prev, [sid]: (prev[sid] ?? 0) + amount }));
  };
  const clearUnreadFor = (sid: string) => {
    if (!sid) return;
    setUnreadByAgent((prev) => {
      if (!prev[sid]) return prev;
      const next = { ...prev };
      delete next[sid];
      return next;
    });
  };
  const clearAllUnread = () => setUnreadByAgent({});

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

  const applySwarmCommand = (command: SwarmWorkCommand) => {
    const directive = buildSwarmWorkDirective(command, swarmCommandMode);
    setMessage((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return directive;
      return `${directive}\n\n${trimmed}`;
    });
    setError(null);
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
          const routedSid = selectedSessionKey || sessionKey;
          if (currentAgentRef.current !== routedSid) {
            incrementUnread(routedSid);
            return;
          }
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
        const [ctxRes, agRes, prRes] = await Promise.all([
          fetch('/api/discussion-context'),
          fetch('/api/agents'),
          fetch('/api/openclaw-agent-profiles'),
        ]);
        const ctx = await ctxRes.json();
        const ag = await agRes.json();
        const pr = await prRes.json().catch(() => ({}));
        if (cancel) return;
        if (Array.isArray(ctx.projects)) setProjects(ctx.projects);
        if (Array.isArray(ctx.requests)) setRequests(ctx.requests);
        if (pr?.profiles && typeof pr.profiles === 'object') {
          const next: Record<string, OpenClawAgentProfileRow> = {};
          for (const [k, v] of Object.entries(pr.profiles as Record<string, unknown>)) {
            if (v && typeof v === 'object') next[k] = v as OpenClawAgentProfileRow;
          }
          setOcProfiles(next);
        }
        if (Array.isArray(ag.agents)) {
          setAgents(ag.agents);
          const rows = ag.agents as AgentRow[];
          const actives = rows.filter(isSessionUsable);
          if (actives.length === 1) setAgentId(actives[0].id);
          else if (rows.length === 1) setAgentId(rows[0].id);
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

  const teamProfiles = useMemo(() => {
    const map: Record<string, AgentTeamProfile> = {};
    for (const a of agents) {
      map[a.id] = mergeOpenClawTeamProfile(a, ocProfiles[a.id] ?? null);
    }
    return map;
  }, [agents, ocProfiles]);

  const selectedTeamProfile = useMemo(() => {
    if (!selectedAgent) return undefined;
    return teamProfiles[selectedAgent.id] ?? mergeOpenClawTeamProfile(selectedAgent, ocProfiles[selectedAgent.id] ?? null);
  }, [selectedAgent, teamProfiles, ocProfiles]);

  useEffect(() => {
    if (!selectedAgent) {
      setProfileDraft({ displayName: '', roleTitle: '', bio: '', avatarUrl: '', avatarEmoji: '' });
      return;
    }
    const base = buildAgentTeamProfile(selectedAgent);
    const row = ocProfiles[selectedAgent.id];
    setProfileDraft({
      displayName: row?.displayName?.trim() || base.displayName,
      roleTitle: row?.roleTitle?.trim() || base.role,
      bio: row?.bio?.trim() || '',
      avatarUrl: row?.avatarUrl?.trim() || '',
      avatarEmoji: row?.avatarEmoji?.trim() || '',
    });
  }, [selectedAgent, ocProfiles]);

  const saveOpenClawProfile = async () => {
    if (!selectedAgent) return;
    setProfileSaving(true);
    setError(null);
    try {
      const inferred = buildAgentTeamProfile(selectedAgent);
      const res = await fetch('/api/openclaw-agent-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionKey: selectedAgent.id,
          displayName: profileDraft.displayName.trim() === inferred.displayName ? '' : profileDraft.displayName.trim(),
          roleTitle: profileDraft.roleTitle.trim() === inferred.role ? '' : profileDraft.roleTitle.trim(),
          bio: profileDraft.bio.trim(),
          avatarUrl: profileDraft.avatarUrl.trim(),
          avatarEmoji: profileDraft.avatarEmoji.trim(),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Échec enregistrement fiche');
      const p = data.profile as Record<string, unknown> | undefined;
      if (p && typeof p.sessionKey === 'string') {
        const sk = p.sessionKey as string;
        setOcProfiles((prev) => ({
          ...prev,
          [sk]: {
            sessionKey: sk,
            displayName: (p.displayName as string | null | undefined) ?? null,
            roleTitle: (p.roleTitle as string | null | undefined) ?? null,
            bio: (p.bio as string | null | undefined) ?? null,
            avatarUrl: (p.avatarUrl as string | null | undefined) ?? null,
            avatarEmoji: (p.avatarEmoji as string | null | undefined) ?? null,
          },
        }));
      }
      setCopyFeedback('Fiche OpenClaw enregistrée.');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Erreur enregistrement');
    } finally {
      setProfileSaving(false);
    }
  };

  /** Réhydrate le fil de discussion depuis OpenClaw (sessions_list) quand l’agent change ou après F5. */
  useEffect(() => {
    currentAgentRef.current = agentId;
    if (agentId) {
      clearUnreadFor(agentId);
      setNotificationsOpen(false);
    }
    if (!agentId) {
      setChat([]);
      setHistoryLoading(false);
      return;
    }
    const gen = ++historyLoadGen.current;
    setChat([]);
    setHistoryLoading(true);
    let cancel = false;
    (async () => {
      try {
        const res = await fetch('/api/discussion-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionKey: agentId, maxMessages: 100 }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          messages?: { role: string; text: string; atDisplay?: string; sortMs?: number }[];
          selectedSessionKey?: string;
          error?: string;
        };
        if (cancel || gen !== historyLoadGen.current) return;
        const rows = Array.isArray(data.messages) ? data.messages : [];
        const selected = typeof data.selectedSessionKey === 'string' ? data.selectedSessionKey.trim() : '';
        setRoutingDebug({
          requestedSessionKey: agentId,
          routedSessionKey: agentId,
          polledSessionKey: agentId,
          selectedSessionKey: selected,
          via: 'discussion-history',
          lastReason: data.ok === false && data.error ? data.error : '',
        });
        setChat(
          rows.map((m, i) => ({
            id: `oc-${agentId}-${i}-${m.sortMs ?? i}`,
            role: m.role === 'user' ? 'user' : 'assistant',
            text: String(m.text || '').slice(0, 8000),
            at: typeof m.atDisplay === 'string' && m.atDisplay ? m.atDisplay : '--:--',
          })),
        );
      } catch {
        if (!cancel && gen === historyLoadGen.current) {
          setChat([]);
          setRoutingDebug({
            requestedSessionKey: agentId,
            routedSessionKey: agentId,
            polledSessionKey: agentId,
            selectedSessionKey: '',
            via: 'discussion-history',
            lastReason: 'erreur_reseau',
          });
        }
      } finally {
        if (!cancel && gen === historyLoadGen.current) setHistoryLoading(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [agentId]);

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
    const picked = agents.find((x) => x.id === agentId);
    if (picked && !isSessionUsable(picked)) {
      setError('Cette session est indisponible. Sélectionnez un agent disponible pour envoyer.');
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
        if (currentAgentRef.current !== routedSessionKey) {
          incrementUnread(routedSessionKey);
        }
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
  const totalUnread = useMemo(
    () => Object.values(unreadByAgent).reduce((sum, n) => sum + n, 0),
    [unreadByAgent],
  );
  const unreadAgents = useMemo(
    () =>
      Object.entries(unreadByAgent)
        .filter(([, count]) => count > 0)
        .map(([id, count]) => ({ agent: agents.find((a) => a.id === id), id, count }))
        .sort((a, b) => b.count - a.count),
    [agents, unreadByAgent],
  );
  const filteredAgentsForList = useMemo(() => {
    const q = sessionQuery.trim().toLowerCase();
    const matches = (a: AgentRow) => {
      if (!q) return true;
      const p = teamProfiles[a.id] ?? buildAgentTeamProfile(a);
      return (
        a.name.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        (p.bio && p.bio.toLowerCase().includes(q))
      );
    };
    const filtered = agents.filter(matches);
    const usable = filtered.filter(isSessionUsable);
    const unusable = filtered.filter((a) => !isSessionUsable(a));
    return [...usable, ...unusable];
  }, [agents, sessionQuery, teamProfiles]);

  const sessionUnavailable = Boolean(selectedAgent && !isSessionUsable(selectedAgent));

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chat, sending, pollingReply, historyLoading]);

  const pickSession = (id: string) => {
    setAgentId(id);
    setSessionSheetOpen(false);
    setNotificationsOpen(false);
    setError(null);
  };

  const renderRemediation = (m: ChatMessage) =>
    m.remediation ? (
      <div class="mt-3 space-y-2 text-xs">
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 transition hover:border-[#175B37]/40 hover:bg-[#E9F3EB]"
            onClick={() => {
              setMessage('Je choisis la méthode JSON. Donne-moi les étapes minimales.');
              void copyToClipboard(m.remediation?.json || '');
            }}
          >
            Choisir JSON
          </button>
          <button
            type="button"
            class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 transition hover:border-[#175B37]/40 hover:bg-[#E9F3EB]"
            onClick={() => {
              setMessage('Je choisis la méthode PowerShell. Guide-moi.');
              void copyToClipboard(m.remediation?.powershellScript || '');
            }}
          >
            PowerShell
          </button>
          <button
            type="button"
            class="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-700 transition hover:border-[#175B37]/40 hover:bg-[#E9F3EB]"
            onClick={() => {
              setMessage('Je choisis la méthode bash/python. Guide-moi.');
              void copyToClipboard(m.remediation?.bashScript || '');
            }}
          >
            bash/python
          </button>
        </div>
        <details class="rounded-lg border border-gray-100 bg-white/90 p-2">
          <summary class="cursor-pointer font-semibold text-gray-800">Infos rapides</summary>
          <div class="mt-2 whitespace-pre-wrap text-gray-600">
            {formatGatewayRemediation({
              title: m.remediation.title,
              endpoint: m.remediation.endpoint,
              endpointMethod: m.remediation.endpointMethod,
              configPath: m.remediation.configPath,
              docs: m.remediation.docs,
            })}
          </div>
        </details>
        <details class="rounded-lg border border-gray-100 bg-white/90 p-2">
          <summary class="cursor-pointer font-semibold">Voir JSON</summary>
          <div class="mt-2">
            <button
              type="button"
              class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]"
              onClick={() => void copyToClipboard(m.remediation?.json || '')}
            >
              Copier JSON
            </button>
          </div>
          <pre class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">{m.remediation.json || ''}</pre>
        </details>
        <details class="rounded-lg border border-gray-100 bg-white/90 p-2">
          <summary class="cursor-pointer font-semibold">Script PowerShell</summary>
          <div class="mt-2">
            <button
              type="button"
              class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]"
              onClick={() => void copyToClipboard(m.remediation?.powershellScript || '')}
            >
              Copier
            </button>
          </div>
          <pre class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">{m.remediation.powershellScript || ''}</pre>
        </details>
        <details class="rounded-lg border border-gray-100 bg-white/90 p-2">
          <summary class="cursor-pointer font-semibold">Script bash/python</summary>
          <div class="mt-2">
            <button
              type="button"
              class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]"
              onClick={() => void copyToClipboard(m.remediation?.bashScript || '')}
            >
              Copier
            </button>
          </div>
          <pre class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">{m.remediation.bashScript || ''}</pre>
        </details>
        <details class="rounded-lg border border-gray-100 bg-white/90 p-2">
          <summary class="cursor-pointer font-semibold">Prompt OpenClaw</summary>
          <div class="mt-2">
            <button
              type="button"
              class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]"
              onClick={() => void copyToClipboard(m.remediation?.openclawPrompt || '')}
            >
              Copier
            </button>
          </div>
          <pre class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">{m.remediation.openclawPrompt || ''}</pre>
        </details>
        <details class="rounded-lg border border-gray-100 bg-white/90 p-2">
          <summary class="cursor-pointer font-semibold">Test API (POST)</summary>
          <div class="mt-2">
            <button
              type="button"
              class="rounded border border-gray-200 bg-white px-2 py-1 text-[11px]"
              onClick={() => void copyToClipboard(m.remediation?.curlTest || '')}
            >
              Copier
            </button>
          </div>
          <pre class="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-[11px]">{m.remediation.curlTest || ''}</pre>
        </details>
      </div>
    ) : null;

  const sessionListBlock = (
    <>
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 class="text-lg font-semibold tracking-tight text-gray-900">L’équipe</h2>
          <p class="text-[11px] text-gray-400">
            Chaque entrée est une <span class="font-semibold text-gray-600">session OpenClaw</span> ; Forge enrichit
            l’affichage (nom, rôle, avatar).
          </p>
        </div>
        <div class="relative">
          <svg
            class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            class="w-40 rounded-full border border-gray-200 bg-gray-50 py-1.5 pl-8 pr-3 text-xs text-gray-800 outline-none transition focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15 sm:w-44"
            placeholder="Filtrer…"
            value={sessionQuery}
            onInput={(e) => setSessionQuery((e.target as HTMLInputElement).value)}
            aria-label="Filtrer les sessions"
          />
        </div>
      </div>

      <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        {filteredAgentsForList.length === 0 && (
          <p class="px-4 py-6 text-center text-sm text-gray-500">
            {agents.length === 0
              ? 'Aucune session listée. Vérifiez le gateway dans Paramètres.'
              : 'Aucun résultat pour cette recherche.'}
          </p>
        )}
        <ul class="divide-y divide-gray-50">
          {filteredAgentsForList.flatMap((a, idx) => {
            const prev = idx > 0 ? filteredAgentsForList[idx - 1] : null;
            const usable = isSessionUsable(a);
            const showSep = Boolean(!usable && prev && isSessionUsable(prev));
            const active = a.id === agentId;
            const profile = teamProfiles[a.id] ?? buildAgentTeamProfile(a);
            const unread = unreadByAgent[a.id] ?? 0;
            const presenceDot =
              profile.presence === 'online'
                ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]'
                : profile.presence === 'offline'
                  ? 'bg-gray-300'
                  : 'bg-amber-400';
            const rowMuted = !usable;
            const row = (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => pickSession(a.id)}
                  class={`flex w-full gap-3 px-4 py-3 text-left transition motion-reduce:transition-none ${
                    rowMuted ? 'opacity-70 saturate-50' : ''
                  } ${
                    active
                      ? rowMuted
                        ? 'bg-gray-200/70'
                        : 'bg-gray-100/90'
                      : rowMuted
                        ? 'hover:bg-gray-100/60'
                        : 'hover:bg-gray-50'
                  }`}
                >
                  <div class="relative shrink-0">
                    <TeamAvatar profile={profile} size="md" class="shadow-inner ring-2 ring-white" />
                    <span
                      class={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${presenceDot}`}
                      title={profile.presenceLabel}
                      aria-hidden="true"
                    />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-2">
                      <span
                        class={`truncate text-sm font-semibold ${
                          active ? (rowMuted ? 'text-gray-700' : 'text-[#175B37]') : rowMuted ? 'text-gray-500' : 'text-gray-900'
                        }`}
                      >
                        {profile.displayName}
                      </span>
                      <div class="flex shrink-0 items-center gap-1.5">
                        {!usable ? (
                          <span class="rounded-full bg-gray-200 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-gray-600">
                            Indispo.
                          </span>
                        ) : null}
                        {unread > 0 ? (
                          <span class="rounded-full bg-[#175B37] px-2 py-0.5 text-[10px] font-semibold text-white">
                            {unread}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p class={`mt-0.5 truncate text-[11px] font-medium ${rowMuted ? 'text-gray-400' : 'text-gray-500'}`}>
                      {profile.role}
                    </p>
                    <p class={`mt-0.5 flex items-center gap-1.5 truncate text-[11px] ${rowMuted ? 'text-gray-400' : 'text-gray-400'}`}>
                      <span class={`h-1.5 w-1.5 shrink-0 rounded-full ${presenceDot}`} aria-hidden="true" />
                      <span class="truncate">{profile.presenceLabel}</span>
                      <span class="text-gray-300" aria-hidden="true">
                        ·
                      </span>
                      <span class="truncate font-mono">{profile.modelShort}</span>
                    </p>
                    <p
                      class={`mt-0.5 truncate text-[10px] font-medium uppercase tracking-wide ${
                        rowMuted ? 'text-gray-400' : 'text-[#175B37]/80'
                      }`}
                    >
                      OpenClaw · {truncateText(a.id, 40)}
                    </p>
                  </div>
                </button>
              </li>
            );
            if (!showSep) return [row];
            const sep = (
              <li key={`sep-${a.id}`} class="border-t border-gray-100 bg-gray-50/80" aria-hidden="true">
                <div class="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Sessions indisponibles
                </div>
              </li>
            );
            return [sep, row];
          })}
        </ul>
      </div>

      <div class="shrink-0 border-t border-gray-100 bg-gray-50/80 px-4 py-3">
        <p class="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Contexte Forge</p>
        <label class="sr-only" for="disc-project">
          Projet
        </label>
        <select
          id="disc-project"
          class={`${inputCls} mb-2`}
          value={projectId}
          onChange={(e) => setProjectId((e.target as HTMLSelectElement).value)}
        >
          <option value="">Projet (aucun)</option>
          {projects.map((p) => (
            <option key={p.id} value={String(p.id)}>
              {p.name}
            </option>
          ))}
        </select>
        <label class="sr-only" for="disc-request">
          Demande
        </label>
        <select
          id="disc-request"
          class={inputCls}
          value={requestId}
          onChange={(e) => setRequestId((e.target as HTMLSelectElement).value)}
          disabled={filteredRequests.length === 0}
        >
          <option value="">Demande (aucune)</option>
          {filteredRequests.map((r) => (
            <option key={r.id} value={String(r.id)}>
              #{r.id} · {truncateText(r.title, 48)}
            </option>
          ))}
        </select>
        {offlineCount > 0 && (
          <p class="mt-2 text-[10px] leading-relaxed text-gray-500">
            {offlineCount} session(s) hors ligne ou désactivée(s) : elles restent listées ci-dessus en grisé (après les
            disponibles). L’envoi de message est désactivé tant qu’une session indisponible est sélectionnée.
          </p>
        )}
      </div>

      <details class="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
        <summary class="cursor-pointer text-xs font-semibold text-gray-800">
          Fiche OpenClaw (persistante)
        </summary>
        <p class="mt-1 text-[11px] text-gray-500">
          Ces champs sont stockés dans la base Forge et s’appliquent à la <strong>session OpenClaw</strong> sélectionnée.
          Laissez vide pour revenir au nom / rôle déduits automatiquement.
        </p>
        {!selectedAgent ? (
          <p class="mt-3 text-xs text-gray-500">Sélectionnez un membre dans la liste pour éditer sa fiche.</p>
        ) : (
          <div class="mt-3 space-y-2">
            <label class="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Nom affiché</label>
            <input
              type="text"
              class={inputCls}
              value={profileDraft.displayName}
              onInput={(e) => setProfileDraft((d) => ({ ...d, displayName: (e.target as HTMLInputElement).value }))}
            />
            <label class="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Rôle affiché</label>
            <input
              type="text"
              class={inputCls}
              value={profileDraft.roleTitle}
              onInput={(e) => setProfileDraft((d) => ({ ...d, roleTitle: (e.target as HTMLInputElement).value }))}
            />
            <label class="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Bio courte</label>
            <textarea
              class={`${inputCls} min-h-[72px]`}
              value={profileDraft.bio}
              onInput={(e) => setProfileDraft((d) => ({ ...d, bio: (e.target as HTMLTextAreaElement).value }))}
              placeholder="Ex. : pointe les sujets préférés, le style de réponse attendu…"
            />
            <label class="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Avatar (URL https)</label>
            <input
              type="url"
              class={inputCls}
              value={profileDraft.avatarUrl}
              onInput={(e) => setProfileDraft((d) => ({ ...d, avatarUrl: (e.target as HTMLInputElement).value }))}
              placeholder="https://…"
            />
            <label class="block text-[10px] font-bold uppercase tracking-wider text-gray-400">Émoji d’avatar</label>
            <input
              type="text"
              class={inputCls}
              value={profileDraft.avatarEmoji}
              onInput={(e) => setProfileDraft((d) => ({ ...d, avatarEmoji: (e.target as HTMLInputElement).value }))}
              placeholder="Ex. 🤖"
            />
            <button
              type="button"
              class="btn btn-success btn-sm mt-2 w-full rounded-xl"
              disabled={profileSaving || !selectedAgent}
              onClick={() => void saveOpenClawProfile()}
            >
              {profileSaving ? 'Enregistrement…' : 'Enregistrer la fiche OpenClaw'}
            </button>
          </div>
        )}
      </details>

      {error && (
        <div class="shrink-0 border-t border-red-100 bg-red-50/95 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      {copyFeedback && (
        <div class="shrink-0 border-t border-emerald-100 bg-emerald-50/95 px-4 py-3 text-sm text-emerald-800">{copyFeedback}</div>
      )}
    </>
  );

  if (loading) {
    return (
      <div class="w-full animate-fade-in">
        <div class="flex min-h-[56vh] overflow-hidden rounded-2xl border border-gray-200 bg-[#ECEFF1] shadow-sm lg:min-h-[62vh]">
          <div class="hidden w-[300px] shrink-0 flex-col border-r border-gray-200 bg-white p-4 lg:flex">
            <div class="mb-4 h-4 w-24 rounded-full bg-gray-200" />
            <div class="mb-3 h-9 w-full rounded-xl bg-gray-100" />
            <div class="space-y-2">
              <div class="h-16 w-full rounded-xl bg-gray-50" />
              <div class="h-16 w-full rounded-xl bg-gray-50" />
              <div class="h-16 w-full rounded-xl bg-gray-50" />
            </div>
          </div>
          <div class="flex min-h-[56vh] flex-1 flex-col bg-[#ECEFF1]">
            <div class="border-b border-gray-200 bg-white px-4 py-3">
              <div class="h-4 w-40 rounded-full bg-gray-200" />
              <div class="mt-2 h-3 w-56 rounded-full bg-gray-100" />
            </div>
            <div class="flex flex-1 flex-col justify-center gap-2 px-6">
              <div class="mx-auto h-3 w-44 rounded-full bg-gray-200/80" />
              <div class="mx-auto h-3 w-56 rounded-full bg-gray-200/60" />
            </div>
            <div class="p-4">
              <div class="h-14 w-full rounded-2xl bg-white shadow-sm" />
            </div>
          </div>
        </div>
        <p class="mt-4 text-center text-xs text-gray-400">Chargement des sessions et du contexte…</p>
      </div>
    );
  }

  return (
    <div class="relative w-full animate-fade-in">
      {sessionSheetOpen ? (
        <button
          type="button"
          class="fixed inset-0 z-30 bg-black/25 backdrop-blur-[1px] lg:hidden"
          aria-label="Fermer la liste des sessions"
          onClick={() => setSessionSheetOpen(false)}
        />
      ) : null}

      <div class="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#ECEFF1] shadow-sm lg:flex-row lg:max-h-[min(85vh,820px)]">
        <aside
          class={`z-40 flex max-h-[100dvh] w-full flex-col border-gray-200 bg-white shadow-xl motion-reduce:transition-none sm:max-w-md lg:max-h-none lg:w-[min(100%,300px)] lg:shrink-0 lg:rounded-none lg:border-r lg:shadow-none ${
            sessionSheetOpen
              ? 'fixed inset-0 flex max-h-[100dvh] lg:static lg:inset-auto lg:flex lg:max-h-none'
              : 'hidden lg:flex'
          }`}
        >
          <div class="flex items-center justify-between border-b border-gray-100 px-3 py-2 lg:hidden">
            <span class="text-sm font-semibold text-gray-800">L’équipe</span>
            <button
              type="button"
              class="rounded-full p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
              onClick={() => setSessionSheetOpen(false)}
              aria-label="Fermer"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {sessionListBlock}
        </aside>

        <div class="flex min-h-[min(100dvh,680px)] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
          <div class="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-white px-3 py-2.5 lg:hidden">
            <button
              type="button"
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50"
              onClick={() => setSessionSheetOpen(true)}
              aria-label="Ouvrir les sessions"
            >
              <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <div class="flex min-w-0 flex-1 items-center gap-2">
              {selectedTeamProfile ? (
                <TeamAvatar profile={selectedTeamProfile} size="sm" />
              ) : (
                <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-bold text-gray-400">
                  ?
                </div>
              )}
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-gray-900">
                  {selectedTeamProfile?.displayName ?? 'Choisir un coéquipier'}
                </p>
                <p class="truncate text-xs text-gray-500">
                  {selectedTeamProfile
                    ? `OpenClaw · ${selectedTeamProfile.role} · ${selectedTeamProfile.presenceLabel}`
                    : 'Ouvrir la liste pour sélectionner'}
                </p>
              </div>
            </div>
          </div>

          <header class="relative flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-5">
            <div class="flex min-w-0 flex-1 gap-3">
              {selectedTeamProfile ? (
                <div class="hidden shrink-0 sm:block">
                  <TeamAvatar profile={selectedTeamProfile} size="md" class="rounded-2xl shadow-inner ring-1 ring-gray-100" />
                </div>
              ) : (
                <div class="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-sm font-bold text-gray-400 shadow-inner sm:flex">
                  ?
                </div>
              )}
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="truncate text-base font-semibold text-gray-900 sm:text-lg">
                    {selectedTeamProfile?.displayName ?? 'Sélectionnez un membre'}
                  </h2>
                  {selectedTeamProfile ? (
                    <>
                      <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                        {selectedTeamProfile.role}
                      </span>
                      <span class="inline-flex items-center gap-1 rounded-full bg-[#E9F3EB] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#175B37]">
                        <svg class="h-3 w-3" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path
                            fill-rule="evenodd"
                            d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                            clip-rule="evenodd"
                          />
                        </svg>
                        OpenClaw
                      </span>
                    </>
                  ) : null}
                </div>
                <p class="mt-0.5 truncate text-xs text-gray-500 sm:text-sm">
                  {selectedTeamProfile
                    ? `Agent OpenClaw · ${selectedTeamProfile.presenceLabel} · modèle ${selectedTeamProfile.modelShort}`
                    : 'Choisissez un membre dans la colonne de gauche (menu sur mobile).'}
                </p>
                {selectedTeamProfile?.bio ? (
                  <p class="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-600">{selectedTeamProfile.bio}</p>
                ) : null}
                {selectedAgent ? (
                  <p class="mt-1 truncate font-mono text-[10px] text-gray-400" title={selectedAgent.id}>
                    Session OpenClaw : {truncateText(selectedAgent.id, 48)}
                  </p>
                ) : null}
                {(selectedProject || selectedRequest) && (
                  <div class="mt-2 flex flex-wrap gap-1.5">
                    {selectedProject ? (
                      <span class="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                        {selectedProject.name}
                      </span>
                    ) : null}
                    {selectedRequest ? (
                      <span class="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                        #{selectedRequest.id} · {truncateText(selectedRequest.title, 28)}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
            <div class="relative shrink-0">
              <button
                type="button"
                class="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                onClick={() => setNotificationsOpen((v) => !v)}
                aria-expanded={notificationsOpen}
                aria-haspopup="true"
                aria-label="Notifications réponses non lues"
              >
                <span class="relative inline-flex">
                  <NotificationBellIcon class="h-5 w-5" />
                  {totalUnread > 0 && (
                    <span class="absolute -right-1 -top-1 inline-flex min-h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[#175B37] px-1 text-[10px] font-bold text-white">
                      {totalUnread > 99 ? '99+' : totalUnread}
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                class="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
                onClick={() => setHeaderMenuOpen((v) => !v)}
                aria-expanded={headerMenuOpen}
                aria-haspopup="true"
                aria-label="Actions conversation"
              >
                <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
                </svg>
              </button>
              {headerMenuOpen ? (
                <>
                  <button
                    type="button"
                    class="fixed inset-0 z-10 cursor-default bg-transparent"
                    aria-label="Fermer le menu"
                    onClick={() => setHeaderMenuOpen(false)}
                  />
                  <div class="absolute right-0 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                    <button
                      type="button"
                      class="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => {
                        setHeaderMenuOpen(false);
                        if (selectedAgent?.id) void copyToClipboard(selectedAgent.id);
                      }}
                      disabled={!selectedAgent}
                    >
                      Copier la clé de session
                    </button>
                    <a
                      href="/settings"
                      class="block px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      onClick={() => setHeaderMenuOpen(false)}
                    >
                      Paramètres OpenClaw
                    </a>
                  </div>
                </>
              ) : null}
              {notificationsOpen ? (
                <>
                  <button
                    type="button"
                    class="fixed inset-0 z-10 cursor-default bg-transparent"
                    aria-label="Fermer les notifications"
                    onClick={() => setNotificationsOpen(false)}
                  />
                  <div class="absolute right-11 z-20 mt-1 w-72 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                    <div class="flex items-center justify-between px-3 py-2">
                      <p class="text-xs font-semibold uppercase tracking-wider text-gray-500">Réponses non lues</p>
                      <button
                        type="button"
                        class="text-xs text-[#175B37] hover:underline disabled:text-gray-300"
                        onClick={() => {
                          clearAllUnread();
                          setNotificationsOpen(false);
                        }}
                        disabled={totalUnread === 0}
                      >
                        Tout marquer lu
                      </button>
                    </div>
                    <div class="max-h-72 overflow-y-auto">
                      {unreadAgents.length === 0 ? (
                        <p class="px-3 py-3 text-sm text-gray-500">Aucune réponse non lue.</p>
                      ) : (
                        unreadAgents.map(({ id, count, agent }) => {
                          const p = agent ? teamProfiles[agent.id] ?? buildAgentTeamProfile(agent) : undefined;
                          return (
                            <button
                              key={id}
                              type="button"
                              class="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition hover:bg-gray-50"
                              onClick={() => pickSession(id)}
                            >
                              <div class="flex min-w-0 items-center gap-2">
                                {p ? (
                                  <TeamAvatar profile={p} size="xs" class="shadow-sm ring-1 ring-gray-100" />
                                ) : (
                                  <div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-bold text-gray-500 shadow-sm ring-1 ring-gray-200">
                                    ?
                                  </div>
                                )}
                                <div class="min-w-0">
                                  <p class="truncate text-sm font-medium text-gray-800">{p?.displayName ?? id}</p>
                                  <p class="truncate text-xs text-gray-500">
                                    {p ? `OpenClaw · ${p.role}` : truncateText(id, 34)}
                                  </p>
                                </div>
                              </div>
                              <span class="rounded-full bg-[#175B37] px-2 py-0.5 text-[10px] font-semibold text-white">{count}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                </>
              ) : null}
            </div>
          </header>

          <div class="relative flex min-h-0 flex-1 flex-col bg-[#ECEFF1]">
            {historyLoading && agentId ? (
              <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#ECEFF1]/85 backdrop-blur-[1px]">
                <span class="loading loading-spinner loading-md text-[#175B37]" />
                <p class="text-xs text-gray-500">Chargement de l’historique…</p>
              </div>
            ) : null}

            <div class="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth px-3 py-4 sm:px-5">
              {chat.length === 0 && !historyLoading && (
                <div class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center animate-fade-in">
                  <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
                    <svg class="h-7 w-7 text-[#175B37]" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                      />
                    </svg>
                  </div>
                  <div class="max-w-sm space-y-2">
                    {agentId ? (
                      <>
                        <p class="text-base font-semibold text-gray-800">Session vide pour l’instant</p>
                        <p class="text-sm text-gray-500">
                          Aucun message renvoyé par le gateway pour cette session. Écrivez ci-dessous ou consultez le
                          debug « routage session ».
                        </p>
                      </>
                    ) : (
                      <>
                        <p class="text-base font-semibold text-gray-800">Prêt quand vous l’êtes</p>
                        <p class="text-sm text-gray-500">
                          Choisissez une session à gauche (menu sur mobile), optionnellement un projet ou une demande,
                          puis envoyez un message.
                        </p>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div class="mx-auto w-full max-w-3xl space-y-4">
                {chat.map((m, i) => {
                  const prev = i > 0 ? chat[i - 1] : null;
                  const showAvatar =
                    (m.role === 'assistant' || m.role === 'system') && (!prev || prev.role === 'user');
                  const isUser = m.role === 'user';

                  if (isUser) {
                    return (
                      <div key={m.id} class="animate-fade-up flex justify-end">
                        <div class="max-w-[min(100%,85%)]">
                          <div class="rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-sm leading-relaxed text-gray-900 shadow-sm ring-1 ring-gray-200/80">
                            <p class="whitespace-pre-wrap">{m.text}</p>
                          </div>
                          <p class="mt-1 pr-1 text-right text-[11px] text-gray-400">Vous · {m.at}</p>
                        </div>
                      </div>
                    );
                  }

                  const bubbleBase =
                    m.role === 'system'
                      ? 'rounded-2xl rounded-bl-md bg-amber-50 px-4 py-2.5 text-sm leading-relaxed text-amber-950 ring-1 ring-amber-200/80'
                      : m.isAck
                        ? 'rounded-2xl rounded-bl-md bg-sky-50 px-4 py-2.5 text-sm leading-relaxed text-sky-950 ring-1 ring-sky-200/80'
                        : 'rounded-2xl rounded-bl-md bg-gray-100 px-4 py-2.5 text-sm leading-relaxed text-gray-800';

                  return (
                    <div key={m.id} class="animate-fade-up flex justify-start gap-2">
                      <div class="w-9 shrink-0 pt-1">
                        {showAvatar ? (
                          m.role === 'system' ? (
                            <div class="flex h-9 w-9 items-center justify-center rounded-full bg-amber-100 text-sm font-bold text-amber-800 shadow-sm ring-1 ring-amber-200">
                              !
                            </div>
                          ) : selectedTeamProfile ? (
                            <TeamAvatar profile={selectedTeamProfile} size="sm" class="shadow-sm ring-1 ring-white" />
                          ) : (
                            <div class="flex h-9 w-9 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 shadow-sm">
                              A
                            </div>
                          )
                        ) : (
                          <span class="block h-9 w-9" aria-hidden="true" />
                        )}
                      </div>
                      <div class="min-w-0 max-w-[min(100%,85%)] flex-1">
                        <div class={bubbleBase}>
                          <p class="whitespace-pre-wrap">{m.text}</p>
                          {renderRemediation(m)}
                        </div>
                        <p class="mt-1 pl-0.5 text-[11px] text-gray-400">
                          {m.role === 'system'
                            ? 'Système'
                            : m.isAck
                              ? `${selectedTeamProfile?.displayName ?? 'Agent OpenClaw'} (statut)`
                              : `${selectedTeamProfile?.displayName ?? 'Agent OpenClaw'} (OpenClaw)`}{' '}
                          · {m.at}
                        </p>
                      </div>
                    </div>
                  );
                })}

                {(sending || pollingReply) && (
                  <div class="animate-fade-up flex justify-start gap-2">
                    {selectedTeamProfile ? (
                      <TeamAvatar profile={selectedTeamProfile} size="sm" class="shadow-sm ring-1 ring-white" />
                    ) : (
                      <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 shadow-sm">
                        …
                      </div>
                    )}
                    <div class="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3 shadow-sm ring-1 ring-gray-200/60">
                      <span class="loading loading-dots loading-sm text-[#175B37]" />
                    </div>
                  </div>
                )}
              </div>
              <div ref={chatEndRef} class="h-2 shrink-0" />
            </div>

            {routingDebug ? (
              <details class="shrink-0 border-t border-gray-200 bg-white/90 px-4 py-2 text-[11px] text-gray-600">
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
            ) : null}

            <div class="shrink-0 border-t border-gray-200 bg-white p-3 sm:p-4">
              <div class="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-2">
                <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Commandes swarm</span>
                {(['start_work', 'pause_work', 'resume_work', 'stop_work'] as SwarmWorkCommand[]).map((cmd) => (
                  <button
                    key={cmd}
                    type="button"
                    class="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-medium text-gray-700 transition hover:border-[#175B37]/40 hover:bg-[#E9F3EB]"
                    onClick={() => applySwarmCommand(cmd)}
                    disabled={sending || historyLoading}
                  >
                    {SWARM_WORK_COMMAND_LABELS[cmd]}
                  </button>
                ))}
                <button
                  type="button"
                  class={`ml-auto rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                    swarmCommandMode === 'leader'
                      ? 'border-[#175B37]/40 bg-[#E9F3EB] text-[#175B37]'
                      : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                  onClick={() => setSwarmCommandMode((m) => (m === 'leader' ? 'direct' : 'leader'))}
                  disabled={sending || historyLoading}
                  title="Mode chef: génère une directive d’orchestration à envoyer au chef"
                >
                  mode {swarmCommandMode === 'leader' ? 'chef' : 'direct'}
                </button>
              </div>
              {sessionUnavailable ? (
                <p class="mx-auto mb-2 max-w-3xl rounded-xl border border-amber-100 bg-amber-50/90 px-3 py-2 text-center text-[11px] text-amber-900 sm:text-left">
                  Cette session OpenClaw est indisponible (hors ligne ou désactivée). Choisissez un membre disponible
                  pour envoyer un message.
                </p>
              ) : null}
              <div class="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm ring-1 ring-black/[0.03]">
                <textarea
                  class="max-h-40 min-h-[48px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm text-gray-900 outline-none focus:ring-0 disabled:opacity-50"
                  placeholder={sessionUnavailable ? 'Sélectionnez une session disponible…' : 'Écrivez un message…'}
                  value={message}
                  onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
                  disabled={sending || historyLoading || sessionUnavailable}
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' || e.shiftKey) return;
                    if (e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                      void send();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => void send()}
                  disabled={sending || historyLoading || sessionUnavailable || !message.trim() || !agentId}
                  class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#175B37] text-white shadow-md transition hover:bg-[#0f4a2d] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  aria-label="Envoyer"
                >
                  {sending ? (
                    <span class="loading loading-spinner loading-sm text-white" />
                  ) : (
                    <svg class="h-5 w-5 -translate-x-px" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </div>
              <p class="mx-auto mt-2 max-w-3xl text-center text-[10px] text-gray-400 sm:text-left">
                <kbd class="kbd kbd-xs">Ctrl</kbd> ou <kbd class="kbd kbd-xs">⌘</kbd> + <kbd class="kbd kbd-xs">Entrée</kbd> pour envoyer
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
