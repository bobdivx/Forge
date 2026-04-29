import { useState, useEffect, useMemo, useRef } from 'preact/hooks';
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

const POLL_ATTEMPTS = 48; // 48 * 2.5s = ~2 minutes
const POLL_INTERVAL_MS = 2500;

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
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [ocProfiles, setOcProfiles] = useState<Record<string, ZimaOSAgentProfileRow>>({});
  const [profileDraft, setProfileDraft] = useState({ displayName: '', roleTitle: '', bio: '', avatarUrl: '', avatarEmoji: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [swarmCommandMode, setSwarmCommandMode] = useState<'direct' | 'leader'>('direct');
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const currentAgentRef = useRef<string>('');

  useEffect(() => {
    Promise.all([
      fetch('/api/projects').then(r => r.json()),
      fetch('/api/requests').then(r => r.json()),
      fetch('/api/agents').then(r => r.json()),
      fetch('/api/openclaw-profiles').then(r => r.json()).catch(() => ({}))
    ]).then(([p, req, a, profData]) => {
      setProjects(Array.isArray(p.data) ? p.data : []);
      setRequests(Array.isArray(req.data) ? req.data : []);
      setAgents(Array.isArray(a.data) ? a.data : []);
      setOcProfiles(profData.data || {});
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
  }, [chat, sending, pollingReply]);

  const teamProfiles = useMemo(() => {
    const map: Record<string, AgentTeamProfile> = {};
    for (const a of agents) {
      map[a.id] = mergeZimaOSTeamProfile(buildAgentTeamProfile(a), ocProfiles[a.id]);
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

  const pickSession = (id: string) => {
    setAgentId(id);
    currentAgentRef.current = id;
    setChat([]);
    setRoutingDebug(null);
    setError(null);
    const p = teamProfiles[id];
    if (p) {
      setProfileDraft({
        displayName: p.displayName || '',
        roleTitle: p.role || '',
        bio: p.bio || '',
        avatarUrl: p.avatarUrl || '',
        avatarEmoji: p.avatarEmoji || ''
      });
    }
    loadHistory(id);
  };

  const loadHistory = async (id: string) => {
    if (!id) return;
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/discussion-history?sessionKey=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('Erreur history');
      const data = await res.json();
      if (Array.isArray(data.chat)) setChat(data.chat);
    } catch (err) {
      console.error(err);
    } finally {
      setHistoryLoading(false);
    }
  };

  const saveZimaOSProfile = async () => {
    if (!agentId) return;
    setProfileSaving(true);
    setError(null);
    try {
      const payload = {
        agentId,
        displayName: profileDraft.displayName.trim() || null,
        roleTitle: profileDraft.roleTitle.trim() || null,
        bio: profileDraft.bio.trim() || null,
        avatarUrl: profileDraft.avatarUrl.trim() || null,
        avatarEmoji: profileDraft.avatarEmoji.trim() || null,
      };
      const res = await fetch('/api/openclaw-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Échec sauvegarde');
      const updated = await fetch('/api/openclaw-profiles').then(r => r.json());
      setOcProfiles(updated.data || {});
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

  const send = async () => {
    if (!agentId || !message.trim() || sending || sessionUnavailable) return;
    const text = message.trim();
    setMessage('');
    setSending(true);
    setError(null);
    setCopyFeedback(null);
    
    const ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const userMsg: ChatMessage = { id: `${Date.now()}-u`, role: 'user', text, at: ts };
    setChat(c => [...c, userMsg]);

    try {
      const payload = {
        agentId,
        message: text,
        projectId: projectId ? parseInt(projectId, 10) : undefined,
        requestId: requestId ? parseInt(requestId, 10) : undefined
      };
      const res = await fetch('/api/zimaos-directive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur gateway');
      
      const ackMsg: ChatMessage = {
        id: `${Date.now()}-ack`,
        role: 'assistant',
        text: data.message || 'Transmis à ZimaOS.',
        at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
        remediation: data.remediation,
        isAck: true
      };
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
    // Cette fonction permet de changer le modèle de l'agent.
    // L'idéal est de mettre à jour le state local d'abord
    setAgents(prev => prev.map(a => a.id === targetAgentId ? { ...a, model: newModel } : a));
    // et de faire l'appel API pour sauvegarder (non implémenté côté serveur pour le moment ?
    // S'il existe un endpoint, ce serait ici.)
    try {
       await fetch('/api/zimaos-sync-agents', { method: 'POST' }); // Peut forcer une synchro si besoin.
    } catch (err) {
       console.error("Erreur sync model change:", err);
    }
  };

  if (loading) return <div>Chargement...</div>;

  return (
    <div class="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-[#ECEFF1] shadow-sm lg:flex-row lg:max-h-[min(85vh,820px)]">
      <aside class="z-40 flex max-h-[100dvh] w-full flex-col border-gray-200 bg-white shadow-xl lg:w-[min(100%,300px)] lg:shrink-0 lg:border-r lg:shadow-none hidden lg:flex">
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
      <div class="flex min-h-[min(100dvh,680px)] min-w-0 flex-1 flex-col overflow-hidden lg:min-h-0">
        <DiscussionHeader 
           selectedTeamProfile={selectedTeamProfile} selectedAgentId={agentId} selectedProject={selectedProject} selectedRequest={selectedRequest}
           setHeaderMenuOpen={setHeaderMenuOpen} headerMenuOpen={headerMenuOpen} copyToClipboard={copyToClipboard}
        />
        <ChatThread 
           chat={chat} historyLoading={historyLoading} agentId={agentId} selectedTeamProfile={selectedTeamProfile}
           sending={sending} pollingReply={pollingReply} routingDebug={routingDebug} chatEndRef={chatEndRef} copyToClipboard={copyToClipboard}
        />
        <ComposerInput 
           message={message} setMessage={setMessage} sending={sending} historyLoading={historyLoading} sessionUnavailable={sessionUnavailable} agentId={agentId}
           send={send} applySwarmCommand={applySwarmCommand} swarmCommandMode={swarmCommandMode} setSwarmCommandMode={setSwarmCommandMode}
        />
      </div>
    </div>
  );
}
