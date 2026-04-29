import type { AgentRow, Project, RequestItem, isSessionUsable } from './types';
import TeamAvatar from '../../agents/TeamAvatar';
import type { AgentTeamProfile } from '../../../lib/agent-profile';
import { truncateText } from './types';

const AVAILABLE_MODELS = ['llama3.2:latest', 'qwen3-coder:30b', 'qwen2.5:7b', 'gemma4:latest'];

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
    return 0;
  });

  return (
    <>
      <div class="flex shrink-0 items-center justify-between gap-2 border-b border-gray-100 px-4 py-3">
        <div>
          <h2 class="text-lg font-semibold tracking-tight text-gray-900">L'équipe</h2>
        </div>
        <div class="relative">
          <input type="search" class="w-40 rounded-full border border-gray-200 bg-gray-50 py-1.5 px-3 text-xs" placeholder="Filtrer..." value={sessionQuery} onInput={(e) => setSessionQuery((e.target as HTMLInputElement).value)} />
        </div>
      </div>
      <div class="custom-scrollbar min-h-0 flex-1 overflow-y-auto">
        <ul class="divide-y divide-gray-50">
          {filtered.map(a => {
            const usable = isUsable(a);
            const active = a.id === agentId;
            const profile = teamProfiles[a.id];
            const presenceDot = profile?.presence === 'online' ? 'bg-emerald-500' : profile?.presence === 'offline' ? 'bg-gray-300' : 'bg-amber-400';
            
            return (
              <li key={a.id} class={`p-3 ${active ? 'bg-gray-100/90' : 'hover:bg-gray-50'}`}>
                <div class="flex items-center gap-3">
                  <div class="relative shrink-0">
                    <button onClick={() => pickSession(a.id)}>
                        {profile ? <TeamAvatar profile={profile} size="md" /> : <div class="w-10 h-10 rounded-full bg-gray-200" />}
                    </button>
                    <span class={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white ${presenceDot}`} />
                  </div>
                  <div class="flex-1 min-w-0">
                    <button onClick={() => pickSession(a.id)} class="text-left w-full">
                      <div class="font-semibold text-sm truncate">{profile?.displayName || a.name}</div>
                      <div class="text-[11px] text-gray-500 truncate">{profile?.role || 'Agent'}</div>
                      <div class="text-[10px] font-bold mt-0.5 text-gray-600">{a.status}</div>
                    </button>
                    <select 
                      class="mt-1 w-full rounded border border-gray-200 bg-white text-[10px] py-1 px-2"
                      value={a.model || ''}
                      onChange={(e) => onModelChange(a.id, (e.target as HTMLSelectElement).value)}
                    >
                      <option value="">Sélectionner modèle...</option>
                      {AVAILABLE_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                      {!AVAILABLE_MODELS.includes(a.model) && a.model && <option value={a.model}>{a.model}</option>}
                    </select>
                  </div>
                </div>
              </li>
            );
          })}
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
