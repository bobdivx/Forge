import { useState, useEffect, useMemo, useRef, useCallback } from 'preact/hooks';
import {
  buildAgentTeamProfile,
  mergeZimaOSTeamProfile,
  type AgentTeamProfile,
  type ZimaOSAgentProfileRow,
} from '../../lib/agent-profile';
import { buildSwarmWorkDirective, type SwarmWorkCommand } from '../../lib/forge-agent-protocol';

import AgentSidebar from './composer/AgentSidebar';
import DiscussionHeader from './composer/DiscussionHeader';
import ChatThread from './composer/ChatThread';
import ComposerInput from './composer/ComposerInput';
import ProfileEditor from './composer/ProfileEditor';
import type { AgentRow, Project, RequestItem, ChatMessage, RoutingDebugState } from './composer/types';
import { isSessionUsable } from './composer/types';
import { handleDiscussionSlashCommand } from './composer/slashCommands';

const POLL_ATTEMPTS = 48; // 48 * 2.5s = ~2 minutes
const POLL_INTERVAL_MS = 2500;

export default function DiscussionComposer({ initialProjectId }: { initialProjectId?: string }) {
  type PolicyBadgeState = { mode: 'off' | 'warn' | 'enforce'; state: 'idle' | 'compliant' | 'non_compliant' };
  const [projects, setProjects] = useState<Project[]>([]);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [projectId, setProjectId] = useState<string>(initialProjectId || '');
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
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [teamPickerOpen, setTeamPickerOpen] = useState(false);
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false);
  const [ocProfiles, setOcProfiles] = useState<Record<string, ZimaOSAgentProfileRow>>({});
  const [profileDraft, setProfileDraft] = useState({ displayName: '', roleTitle: '', bio: '', avatarUrl: '', avatarEmoji: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [swarmCommandMode, setSwarmCommandMode] = useState<'direct' | 'leader'>('direct');
  const [policyBadge, setPolicyBadge] = useState<PolicyBadgeState>({ mode: 'off', state: 'idle' });
  const [currentSteps, setCurrentSteps] = useState<any[]>([]);
  /** Clé de fil de discussion (persistée côté Forge dans ForgeChatMessage.sessionId). Peut différer de agentId (ex. CHEF_TECHNIQUE__uuid). */
  const [discussionThreadKey, setDiscussionThreadKey] = useState('');
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const currentAgentRef = useRef<string>('');

  useEffect(() => {
    let interval: any;
    if (sending && discussionThreadKey) {
      interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/discussion-steps?sessionId=${encodeURIComponent(discussionThreadKey)}`);
          if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data.steps)) setCurrentSteps(data.steps);
          }
        } catch (err) {
          console.warn('Steps poll failed', err);
        }
      }, 2000);
    } else {
      setCurrentSteps([]);
    }
    return () => clearInterval(interval);
  }, [sending, discussionThreadKey]);

  useEffect(() => {
    Promise.all([
      fetch('/api/discussion-context').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/forge-agent-profiles').then(r => r.json()).catch(() => ({}))
    ]).then(([ctx, a, profData]) => {
      setProjects(Array.isArray(ctx.projects) ? ctx.projects : []);
      setRequests(Array.isArray(ctx.requests) ? ctx.requests : []);
      setAgents(Array.isArray(a.agents) ? a.agents : Array.isArray(a.data) ? a.data : []);
      setOcProfiles(profData.profiles || {});
      setLoading(false);
    }).catch(err => {
      console.error(err);
      setError('Erreur lors du chargement initial');
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chat, sending, pollingReply, currentSteps]);

  const teamProfiles = useMemo(() => {
    const map: Record<string, AgentTeamProfile> = {};
    for (const a of agents) {
      map[a.id] = mergeZimaOSTeamProfile(a, ocProfiles[a.id]);
    }
    return map;
  }, [agents, ocProfiles]);

  const selectedAgent = useMemo(() => agents.find((a) => a.id === agentId), [agents, agentId]);
  const selectedTeamProfile = useMemo(() => selectedAgent ? teamProfiles[selectedAgent.id] : undefined, [selectedAgent, teamProfiles]);
  const selectedProject = useMemo(() => projects.find((p) => String(p.id) === projectId), [projects, projectId]);
  const selectedRequest = useMemo(() => requests.find((r) => String(r.id) === requestId), [requests, requestId]);
  const sessionUnavailable = selectedAgent ? !isSessionUsable(selectedAgent) : false;
  const offlineCount = agents.filter(a => !isSessionUsable(a)).length;

  const copyToClipboard = async (text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopyFeedback('Copié dans le presse-papiers.');
      setTimeout(() => setCopyFeedback(null), 1800);
    } catch {
      setError('Copie impossible automatiquement.');
    }
  };

  const onEmptyMemberClick = () => {
    if (typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches) {
      document.getElementById('discussion-team-sidebar')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }
    setTeamPickerOpen(true);
  };

  const onOpenProfile = () => {
    if (!agentId) return;
    setProfileDrawerOpen(true);
  };

  const loadHistory = async (sessionKey: string) => {
    if (!sessionKey) return;
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/discussion-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey, maxMessages: 100 }),
      });
      if (!res.ok) throw new Error('Erreur history');
      const data = await res.json();
      if (Array.isArray(data.messages)) setChat(data.messages);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const reloadContext = useCallback(async () => {
    const [ctx, a, profData] = await Promise.all([
      fetch('/api/discussion-context').then((r) => r.json()),
      fetch('/api/agents').then((r) => r.json()),
      fetch('/api/forge-agent-profiles').then((r) => r.json()).catch(() => ({})),
    ]);
    setProjects(Array.isArray(ctx.projects) ? ctx.projects : []);
    setRequests(Array.isArray(ctx.requests) ? ctx.requests : []);
    setAgents(Array.isArray(a.agents) ? a.agents : Array.isArray(a.data) ? a.data : []);
    setOcProfiles((profData as { profiles?: Record<string, ZimaOSAgentProfileRow> }).profiles || {});
  }, []);

  const pickSession = async (id: string, opts?: { systemNote?: string }) => {
    setAgentId(id);
    currentAgentRef.current = id;
    setDiscussionThreadKey(id);
    setChat([]);
    setRoutingDebug(null);
    setError(null);
    setTeamPickerOpen(false);
    const p = teamProfiles[id];
    if (p) {
      setProfileDraft({
        displayName: p.displayName || '',
        roleTitle: p.role || '',
        bio: p.bio || '',
        avatarUrl: p.avatarUrl || '',
        avatarEmoji: p.avatarEmoji || '',
      });
    }
    await loadHistory(id);
    const note = opts?.systemNote?.trim();
    if (note) {
      setChat((c) => [
        {
          id: `${Date.now()}-pick-note`,
          role: 'system',
          text: note,
          at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        },
        ...c,
      ]);
    }
  };

  const saveZimaOSProfile = async () => {
    if (!agentId) return;
    setProfileSaving(true);
    setError(null);
    try {
      const payload = {
        sessionKey: agentId,
        displayName: profileDraft.displayName.trim() || null,
        roleTitle: profileDraft.roleTitle.trim() || null,
        bio: profileDraft.bio.trim() || null,
        avatarUrl: profileDraft.avatarUrl.trim() || null,
        avatarEmoji: profileDraft.avatarEmoji.trim() || null,
      };
      const res = await fetch('/api/forge-agent-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Échec sauvegarde');
      const updated = await fetch('/api/forge-agent-profiles').then(r => r.json());
      setOcProfiles(updated.profiles || {});
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setProfileSaving(false);
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

  const buildAssistantMessage = (data: any, steps: NonNullable<ChatMessage['steps']>): ChatMessage => {
    const strictModeStep = steps.find((s) => s?.type === 'policy' && s?.label === 'strict_mode');
    const strictAuditStep = steps.find((s) => s?.type === 'policy' && s?.label === 'strict_audit');
    const modeRaw = String(strictModeStep?.payload || 'off').toLowerCase();
    const mode: PolicyBadgeState['mode'] = modeRaw === 'warn' || modeRaw === 'enforce' ? modeRaw : 'off';
    const auditRaw = String(strictAuditStep?.payload || '').toLowerCase();
    const state: PolicyBadgeState['state'] =
      auditRaw === 'compliant' ? 'compliant' : auditRaw === 'non_compliant' ? 'non_compliant' : 'idle';
    setPolicyBadge({ mode, state });

    return {
      id: `${Date.now()}-ack`,
      role: 'assistant',
      text: data?.result?.reply || data.message || 'Réponse Forge reçue.',
      at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
      remediation: data.remediation,
      isAck: false,
      policy: { mode, state },
      steps,
      turnId: typeof data?.turnId === 'string' ? data.turnId : undefined,
    };
  };

  const sendWithStream = async (payload: Record<string, unknown>): Promise<any> => {
    const res = await fetch('/api/forge-chat-stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) {
      const data = await res.json().catch(() => ({}));
      throw new Error(typeof data?.error === 'string' ? data.error : `Erreur stream (${res.status})`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let finalData: any = null;
    let eventName = 'message';
    const streamedSteps: Array<Record<string, unknown>> = [];

    const consumeBlock = (block: string) => {
      const lines = block.split(/\r?\n/);
      let dataRaw = '';
      eventName = 'message';
      for (const line of lines) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        if (line.startsWith('data:')) dataRaw += line.slice(5).trim();
      }
      if (!dataRaw) return;
      const data = JSON.parse(dataRaw);
      if (eventName === 'step') {
        streamedSteps.push(data);
        setCurrentSteps([...streamedSteps]);
      } else if (eventName === 'done') {
        finalData = data;
      } else if (eventName === 'error') {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Erreur stream');
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split(/\n\n/);
      buffer = parts.pop() || '';
      for (const part of parts) consumeBlock(part);
    }
    if (buffer.trim()) consumeBlock(buffer);
    if (!finalData) throw new Error('Réponse stream incomplète');
    return { ...finalData, steps: finalData.steps || streamedSteps };
  };

  function isLikelyNetworkFailure(err: unknown): boolean {
    const m = err instanceof Error ? err.message : String(err);
    return /failed to fetch|networkerror|network error|load failed|aborted|échec du réseau|typeerror:\s*failed to fetch/i.test(
      m,
    );
  }

  /** Repli si l’SSE est coupé par un proxy ou le navigateur (souvent affiché comme « network error »). */
  const sendViaJsonFallback = async (payload: Record<string, unknown>): Promise<any> => {
    const res = await fetch('/api/forge-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof data?.error === 'string' ? data.error : `Erreur forge-chat (${res.status})`);
    }
    return {
      ok: data.ok,
      via: data.via,
      sessionId: data.sessionId,
      turnId: data.turnId,
      result: data.result,
      steps: Array.isArray(data.steps) ? data.steps : [],
    };
  };

  const sendWithStreamMaybeFallback = async (payload: Record<string, unknown>): Promise<any> => {
    try {
      return await sendWithStream(payload);
    } catch (e) {
      if (isLikelyNetworkFailure(e)) {
        console.warn('[discussion] Stream indisponible, repli sur /api/forge-chat', e);
        return await sendViaJsonFallback(payload);
      }
      throw e;
    }
  };

  const send = async () => {
    if (!agentId || !message.trim() || sending || sessionUnavailable) return;
    const text = message.trim();
    const threadKey = discussionThreadKey || agentId;

    const slash = await handleDiscussionSlashCommand(text, {
      agentId,
      discussionThreadKey: threadKey,
      projectId,
      requestId,
      agents,
      projects,
      requests,
      setMessage,
      setDiscussionThreadKey,
      setProjectId,
      setRequestId,
      setCurrentSteps,
      setError,
      appendSystemMessages: (msgs) => setChat((c) => [...c, ...msgs]),
      pickSession,
      reloadContext,
      onModelChange,
    });
    if (slash.kind === 'handled') return;

    setMessage('');
    setSending(true);
    setError(null);
    setCopyFeedback(null);
    setPolicyBadge((prev) => (prev.mode === 'off' ? prev : { ...prev, state: 'idle' }));
    
    const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = { id: `${Date.now()}-u`, role: 'user', text, at: ts };
    setChat(c => [...c, userMsg]);

    try {
      const payload = {
        sessionKey: threadKey,
        agentId,
        message: text,
        modelHint: selectedAgent?.model && selectedAgent.model !== '—' ? selectedAgent.model : undefined,
        projectId: projectId ? parseInt(projectId, 10) : undefined,
        requestId: requestId ? parseInt(requestId, 10) : undefined
      };
      setCurrentSteps([]);
      const data = await sendWithStreamMaybeFallback(payload);
      
      const steps = Array.isArray(data?.steps) ? data.steps as NonNullable<ChatMessage['steps']> : [];
      const ackMsg = buildAssistantMessage(data, steps);
      setChat(c => [...c, ackMsg]);
    } catch (err) {
      setChat(c => [...c, {
        id: `${Date.now()}-err`,
        role: 'system',
        text: `Erreur d'envoi: ${err instanceof Error ? err.message : String(err)}`,
        at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
      }]);
    } finally {
      setSending(false);
    }
  };

  const onModelChange = async (targetAgentId: string, newModel: string) => {
    // Mise à jour optimiste de l'UI…
    setAgents(prev => prev.map(a => a.id === targetAgentId ? { ...a, model: newModel } : a));
    if (!newModel) return; // simple reset visuel, rien à persister
    try {
      const r = await fetch('/api/agent-instructions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: targetAgentId, model: newModel }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        console.error('Mise à jour du modèle agent impossible:', data?.error || r.statusText);
        return;
      }
      // Re-synchro légère pour rafraîchir d'éventuels champs annexes
      fetch('/api/agents')
        .then((res) => res.json())
        .then((d) => {
          if (Array.isArray(d?.agents)) setAgents(d.agents);
        })
        .catch(() => {});
    } catch (err) {
      console.error('Erreur réseau lors du changement de modèle agent:', err);
    }
  };

  if (loading) return <div>Chargement...</div>;

  return (
    <div class="flex min-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#ECEFF1] shadow-sm lg:flex-row lg:max-h-[min(85vh,820px)]">
      <aside
        id="discussion-team-sidebar"
        class="z-40 flex max-h-[100dvh] w-full flex-col border-gray-200 bg-white shadow-xl lg:w-[min(100%,300px)] lg:shrink-0 lg:border-r lg:shadow-none hidden lg:flex"
      >
        <AgentSidebar 
          agents={agents} teamProfiles={teamProfiles} agentId={agentId} pickSession={pickSession}
          projects={projects} projectId={projectId} setProjectId={setProjectId}
          requests={requests} requestId={requestId} setRequestId={setRequestId}
          sessionQuery={sessionQuery} setSessionQuery={setSessionQuery} offlineCount={offlineCount}
          onModelChange={onModelChange}
        />
        <ProfileEditor 
           selectedAgentId={agentId} profileDraft={profileDraft} setProfileDraft={setProfileDraft}
           profileSaving={profileSaving} saveZimaOSProfile={saveZimaOSProfile}
        />
      </aside>
      <div class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <DiscussionHeader 
           selectedTeamProfile={selectedTeamProfile} selectedAgentId={agentId} selectedProject={selectedProject} selectedRequest={selectedRequest}
           setHeaderMenuOpen={setHeaderMenuOpen} headerMenuOpen={headerMenuOpen} copyToClipboard={copyToClipboard}
           onEmptyMemberClick={onEmptyMemberClick}
           onOpenProfile={onOpenProfile}
           policyBadge={policyBadge}
        />
        <ChatThread 
           chat={chat} historyLoading={historyLoading} agentId={agentId} selectedTeamProfile={selectedTeamProfile}
           sending={sending} pollingReply={pollingReply} routingDebug={routingDebug} chatEndRef={chatEndRef} copyToClipboard={copyToClipboard}
           currentSteps={currentSteps}
        />
        <ComposerInput 
           message={message} setMessage={setMessage} sending={sending} historyLoading={historyLoading} sessionUnavailable={sessionUnavailable} agentId={agentId}
           send={send} applySwarmCommand={applySwarmCommand} swarmCommandMode={swarmCommandMode} setSwarmCommandMode={setSwarmCommandMode}
        />
      </div>

      {teamPickerOpen ? (
        <div class="fixed inset-0 z-[100] flex items-stretch lg:hidden" role="dialog" aria-modal="true" aria-labelledby="discussion-team-picker-title">
          <button
            type="button"
            class="absolute inset-0 z-0 bg-black/40 cursor-default"
            aria-label="Fermer"
            onClick={() => setTeamPickerOpen(false)}
            tabIndex={-1}
          />
          <div class="relative z-10 flex h-full w-[min(100%,340px)] min-h-0 flex-col overflow-hidden bg-white shadow-2xl">
            <div class="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <h2 id="discussion-team-picker-title" class="text-lg font-semibold text-gray-900">
                L'équipe
              </h2>
              <button
                type="button"
                class="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                onClick={() => setTeamPickerOpen(false)}
                aria-label="Fermer la liste"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
              <AgentSidebar
                agents={agents}
                teamProfiles={teamProfiles}
                agentId={agentId}
                pickSession={pickSession}
                projects={projects}
                projectId={projectId}
                setProjectId={setProjectId}
                requests={requests}
                requestId={requestId}
                setRequestId={setRequestId}
                sessionQuery={sessionQuery}
                setSessionQuery={setSessionQuery}
                offlineCount={offlineCount}
                onModelChange={onModelChange}
              />
            </div>
          </div>
        </div>
      ) : null}

      {profileDrawerOpen ? (
        <div class="fixed inset-0 z-[101] flex items-stretch lg:hidden" role="dialog" aria-modal="true" aria-labelledby="discussion-profile-drawer-title">
          <button
            type="button"
            class="absolute inset-0 z-0 bg-black/40 cursor-default"
            aria-label="Fermer"
            onClick={() => setProfileDrawerOpen(false)}
            tabIndex={-1}
          />
          <div class="relative z-10 ml-auto flex h-full w-[min(100%,360px)] min-h-0 flex-col overflow-hidden bg-white shadow-2xl">
            <div class="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
              <h2 id="discussion-profile-drawer-title" class="text-lg font-semibold text-gray-900">
                Profil agent
              </h2>
              <button
                type="button"
                class="rounded-full p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                onClick={() => setProfileDrawerOpen(false)}
                aria-label="Fermer le profil"
              >
                <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
              <ProfileEditor 
                 selectedAgentId={agentId} profileDraft={profileDraft} setProfileDraft={setProfileDraft}
                 profileSaving={profileSaving} saveZimaOSProfile={saveZimaOSProfile}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
