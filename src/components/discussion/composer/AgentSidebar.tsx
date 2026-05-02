import { useState, useEffect } from 'preact/hooks';
import type { AgentRow, Project, RequestItem, isSessionUsable } from './types';
import TeamAvatar from '../../agents/TeamAvatar';
import type { AgentTeamProfile } from '../../../lib/agent-profile';
import { truncateText } from './types';

interface Props {
  agents: AgentRow[];
  teamProfiles: Record<string, AgentTeamProfile>;
  agentId: string;
  pickSession: (id: string) => void;
  projects: Project[];
  projectId: string;
  setProjectId: (id: string) => void;
  requests: RequestItem[];
  requestId: string;
  setRequestId: (id: string) => void;
  sessionQuery: string;
  setSessionQuery: (q: string) => void;
  offlineCount: number;
  onModelChange: (agentId: string, newModel: string) => void;
}

export default function AgentSidebar({
  agents, teamProfiles, agentId, pickSession,
  projects, projectId, setProjectId,
  requests, requestId, setRequestId,
  sessionQuery, setSessionQuery, offlineCount, onModelChange
}: Props) {
  const [availableModels, setAvailableModels] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/models?filter=active')
      .then(res => res.json())
      .then((data: any[]) => {
        if (Array.isArray(data)) {
          const names = data.map(m => m.name || m.id).filter(Boolean);
          const unique = Array.from(new Set(names));
          if (unique.length > 0) {
            setAvailableModels(unique);
          }
        }
      })
      .catch(() => {});
  }, []);
  const inputCls = 'w-full rounded-2xl border border-gray-200 bg-gray-50/80 px-3.5 py-2.5 text-sm text-gray-900 shadow-inner shadow-white/40 outline-none transition focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20';

  const isUsable = (a: AgentRow) => {
    if (a.raw?.disabledInDb || a.raw?.offline) return false;
    return !/désactivé/i.test(a.status);
  };

  const filtered = agents.filter(a => {
    if (!sessionQuery) return true;
    const q = sessionQuery.toLowerCase();
    const p = teamProfiles[a.id];
    return a.id.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || a.status.toLowerCase().includes(q) || (p?.displayName || '').toLowerCase().includes(q) || (p?.role || '').toLowerCase().includes(q);
  }).sort((a, b) => {
    const ua = isUsable(a);
    const ub = isUsable(b);
    if (ua && !ub) return -1;
    if (!ua && ub) return 1;
    
    // Si même état, on trie par nom
    const profileA = teamProfiles[a.id];
    const profileB = teamProfiles[b.id];
    
    // Les agents principaux d'abord, puis les sous-agents
    if (!profileA?.isSubAgent && profileB?.isSubAgent) return -1;
    if (profileA?.isSubAgent && !profileB?.isSubAgent) return 1;
    
    return a.id.localeCompare(b.id);
  });

  const getParentId = (id: string) => {
    if (id.includes('_app_')) return id.split('_app_')[0];
    if (id.includes('subagent:')) {
       // On cherche si un agent a cet ID sans le prefixe ou avec un prefixe connu
       const parts = id.split(':');
       if (parts.length > 1) return parts[0];
    }
    return null;
  };

  const parents = filtered.filter(a => !getParentId(a.id));
  const children = filtered.filter(a => !!getParentId(a.id));

  const renderAgentItem = (a: AgentRow, isSub = false) => {
    const usable = isUsable(a);
    const active = a.id === agentId;
    const profile = teamProfiles[a.id];
    const presenceDot = profile?.presence === 'online' ? 'bg-emerald-500' : profile?.presence === 'offline' ? 'bg-gray-300' : 'bg-amber-400';

    return (
      <li key={a.id} class={`transition-all ${active ? 'bg-[#E9F3EB] border-l-4 border-[#175B37]' : 'hover:bg-gray-50 border-l-4 border-transparent'} ${isSub ? 'bg-gray-50/40' : ''}`}>
        <div class={`flex items-center gap-3 p-3 ${isSub ? 'pl-8' : ''}`}>
          <div class="relative shrink-0">
            <button onClick={() => pickSession(a.id)}>
                {profile ? <TeamAvatar profile={profile} size={isSub ? "sm" : "md"} /> : <div class={`${isSub ? 'w-8 h-8' : 'w-10 h-10'} rounded-full bg-gray-200`} />}
            </button>
            <span class={`absolute bottom-0 right-0 ${isSub ? 'h-2.5 w-2.5' : 'h-3 w-3'} rounded-full border-2 border-white ${presenceDot}`} />
          </div>
          <div class="flex-1 min-w-0">
            <button onClick={() => pickSession(a.id)} class="text-left w-full group">
              <div class="flex items-center gap-1.5">
                <div class={`font-bold truncate ${isSub ? 'text-[12px]' : 'text-[14px]'} ${active ? 'text-[#175B37]' : 'text-gray-900'}`}>{profile?.displayName || a.name}</div>
                {isSub && (
                  <span class="shrink-0 px-1 py-0.5 rounded text-[8px] font-bold bg-blue-50 text-blue-500 uppercase tracking-wider border border-blue-100">Sub</span>
                )}
              </div>
              <div class="text-[10px] text-gray-500 truncate font-medium uppercase tracking-tight">{profile?.role || 'Agent'}</div>
              {!isSub && <div class="text-[9px] font-bold mt-0.5 text-gray-400 group-hover:text-gray-600 transition-colors">{a.status}</div>}
            </button>
            <select 
              class="mt-1.5 w-full rounded-lg border border-gray-100 bg-white/50 text-[10px] py-1 px-2 outline-none focus:border-[#175B37]/30"
              value={a.model || ''}
              onChange={(e) => onModelChange(a.id, (e.target as HTMLSelectElement).value)}
            >
              <option value="">Modèle...</option>
              {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
              {!availableModels.includes(a.model) && a.model && <option value={a.model}>{a.model}</option>}
            </select>
          </div>
        </div>
      </li>
    );
  };

  return (
    <>
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-4 bg-gray-50/50">
        <h2 class="text-sm font-bold uppercase tracking-widest text-gray-400">Swarm Team</h2>
        <div class="relative">
          <input type="search" class="w-32 rounded-full border border-gray-200 bg-white py-1.5 px-3 text-[10px] focus:ring-2 focus:ring-[#175B37]/10 outline-none transition-all" placeholder="Rechercher..." value={sessionQuery} onInput={(e) => setSessionQuery((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto bg-white">
        <ul class="divide-y divide-gray-50">
          {parents.map(p => (
            <>
              {renderAgentItem(p)}
              {children.filter(c => getParentId(c.id) === p.id).map(c => renderAgentItem(c, true))}
            </>
          ))}
          {/* Agents orphelins (sous-agents sans parent dans la liste) */}
          {children.filter(c => !parents.some(p => p.id === getParentId(c.id))).map(c => renderAgentItem(c, true))}
        </ul>
      </div>
      <div class="shrink-0 border-t border-gray-100 bg-gray-50/80 px-4 py-3">
        <select class={`${inputCls} mb-2`} value={projectId} onChange={(e) => setProjectId((e.target as HTMLSelectElement).value)}>
          <option value="">Projet (aucun)</option>
          {projects.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}
        </select>
        <select class={inputCls} value={requestId} onChange={(e) => setRequestId((e.target as HTMLSelectElement).value)}>
          <option value="">Demande (aucune)</option>
          {requests.map(r => <option key={r.id} value={String(r.id)}>{truncateText(r.title, 48)}</option>)}
        </select>
      </div>
    </>
  );
}
