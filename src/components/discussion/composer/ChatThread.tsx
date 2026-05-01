import type { ChatMessage, RoutingDebugState } from './types';
import type { AgentTeamProfile } from '../../../lib/agent-profile';
import TeamAvatar from '../../agents/TeamAvatar';
import RemediationGuide from './RemediationGuide';
import Markdown from '../../ui/Markdown';
import { useState } from 'preact/hooks';

interface Props {
  chat: ChatMessage[];
  historyLoading: boolean;
  agentId: string;
  selectedTeamProfile?: AgentTeamProfile;
  sending: boolean;
  pollingReply: boolean;
  routingDebug: RoutingDebugState | null;
  chatEndRef: preact.RefObject<HTMLDivElement>;
  copyToClipboard: (text: string) => Promise<void>;
  currentSteps?: any[];
}

function StepLog({ steps }: { steps: ChatMessage['steps'] }) {
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [groupExpanded, setGroupExpanded] = useState(false);
  if (!steps || steps.length === 0) return null;

  const getIcon = (s: any) => {
    const l = s.label?.toLowerCase() || '';
    if (s.type === 'thought' || l.includes('thought') || l.includes('réfléchi')) return (
      <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
    );
    if (l.includes('explor')) return (
      <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
    );
    if (l.includes('modif') || l.includes('edit')) return (
      <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
    );
    if (l.includes('command') || l.includes('ran') || s.type === 'tool') return (
      <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
    );
    if (s.type === 'llm' || l.includes('plan')) return (
      <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
    );
    return (
      <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
    );
  };

  const getLabel = (s: any) => {
    if (s.label?.toLowerCase().includes('plan_detected')) return 'Plan de travail détecté';
    if (s.label?.toLowerCase().includes('ollama_chat')) return 'Génération de la réponse';
    return s.label;
  };

  const visibleSteps = steps.filter(s => s.type !== 'policy' || s.label === 'plan_detected');
  
  // Groupement des outils consécutifs pour éviter le bruit
  const toolSteps = visibleSteps.filter(s => s.type === 'tool');
  const otherSteps = visibleSteps.filter(s => s.type !== 'tool');

  return (
    <div class="mt-4 space-y-2 border-l-2 border-gray-100 pl-3">
      {otherSteps.map((s, idx) => {
        const isExpanded = expandedIdx === idx;
        const isThought = s.type === 'thought';
        const hasPayload = s.payload && s.payload !== 'ok' && s.payload !== 'running';
        
        return (
          <div key={idx} class={`group flex flex-col gap-1 ${isThought ? 'bg-amber-50/50 rounded-lg p-2 border border-amber-100/50 mb-2' : ''}`}>
            <div 
              class={`flex cursor-pointer items-center gap-2 text-[12px] transition-colors ${isExpanded ? (isThought ? 'text-amber-700' : 'text-blue-600') : 'text-gray-500 hover:text-gray-800'}`}
              onClick={() => setExpandedIdx(isExpanded ? null : idx)}
            >
              <span class={`flex h-4 w-4 items-center justify-center rounded ${isThought ? 'bg-amber-100 text-amber-600' : 'bg-gray-50 group-hover:bg-gray-100'}`}>
                {getIcon(s)}
              </span>
              <span class={`flex-1 truncate font-mono ${isThought ? 'font-semibold italic' : ''}`}>
                {getLabel(s)}
                {!isExpanded && hasPayload && (
                  <span class="ml-2 text-gray-300 opacity-60">({(s.payload as string).slice(0, 40)}...)</span>
                )}
              </span>
              {hasPayload && (
                <svg class={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
                </svg>
              )}
            </div>
            
            {(isExpanded || isThought) && hasPayload && (
              <div class={`mb-2 ml-6 mt-1 overflow-hidden rounded-lg border p-2 shadow-inner ${isThought ? 'bg-white border-amber-50' : 'bg-gray-50/50 border-gray-100'}`}>
                <pre class={`max-h-60 overflow-y-auto font-mono text-[11px] leading-relaxed ${isThought ? 'text-amber-800/80 whitespace-pre-wrap' : 'text-gray-600'}`}>
                  {s.payload}
                </pre>
              </div>
            )}
          </div>
        );
      })}

      {toolSteps.length > 0 && (
        <div class="mt-2">
          <button 
            onClick={() => setGroupExpanded(!groupExpanded)}
            class="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span class="flex h-4 w-4 items-center justify-center rounded bg-gray-100">
               <svg class="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
            </span>
            {toolSteps.length} Action{toolSteps.length > 1 ? 's' : ''} technique{toolSteps.length > 1 ? 's' : ''}
            <svg class={`h-3 w-3 transition-transform ${groupExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
          
          {groupExpanded && (
            <div class="mt-2 space-y-1.5 ml-2 border-l border-gray-200 pl-3 animate-fade-in">
              {toolSteps.map((s, idx) => (
                <div key={idx} class="text-[11px] text-gray-500 font-mono flex items-center gap-2">
                   <span class={`w-1.5 h-1.5 rounded-full ${s.status === 'completed' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                   {getLabel(s)}
                   {s.payload && s.payload !== 'ok' && (
                     <span class="text-gray-300 italic truncate">({(s.payload as string).slice(0, 50)})</span>
                   )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ChatThread({
  chat, historyLoading, agentId, selectedTeamProfile,
  sending, pollingReply, routingDebug, chatEndRef, copyToClipboard,
  currentSteps
}: Props) {
  return (
    <div class="relative flex min-h-0 flex-1 flex-col bg-[#F8FAFB]">
      {historyLoading && agentId ? (
        <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/60 backdrop-blur-[2px]">
          <span class="loading loading-spinner loading-md text-[#175B37]" />
          <p class="text-xs font-medium text-gray-500">Chargement de la session...</p>
        </div>
      ) : null}

      <div class="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth px-3 py-6 sm:px-6">
        {chat.length === 0 && !historyLoading && (
          <div class="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center animate-fade-in opacity-60">
             <div class="h-16 w-16 rounded-3xl bg-white shadow-sm flex items-center justify-center border border-gray-100">
                <svg class="h-8 w-8 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
             </div>
             <div class="max-w-xs space-y-1">
                <p class="text-sm font-semibold text-gray-800">{agentId ? 'Début de la conversation' : 'Sélectionnez un agent'}</p>
                <p class="text-xs text-gray-500">Envoyez votre directive pour commencer le travail.</p>
             </div>
          </div>
        )}

        <div class="mx-auto w-full max-w-3xl space-y-8">
          {chat.map((m, i) => {
            const prev = i > 0 ? chat[i - 1] : null;
            const isFirstInGroup = !prev || prev.role !== m.role;
            const isUser = m.role === 'user';

            if (isUser) {
              return (
                <div key={m.id} class="animate-fade-up flex flex-col items-end gap-1.5">
                  <div class="group relative max-w-[85%] rounded-2xl rounded-tr-sm bg-white px-4 py-3 text-[14px] leading-relaxed text-gray-800 shadow-sm border border-gray-100">
                    <Markdown content={m.text} />
                  </div>
                  <div class="flex items-center gap-2 pr-1">
                    <span class="text-[10px] font-medium uppercase tracking-wider text-gray-400">{m.at}</span>
                  </div>
                </div>
              );
            }

            return (
              <div key={m.id} class={`animate-fade-up flex flex-col gap-3 ${isFirstInGroup ? 'mt-4' : 'mt-1'}`}>
                {isFirstInGroup && (
                  <div class="flex items-center gap-2.5 mb-1">
                    <div class="h-6 w-6 shrink-0">
                      {selectedTeamProfile && <TeamAvatar profile={selectedTeamProfile} size="xs" />}
                    </div>
                    <span class="text-xs font-bold text-gray-900 tracking-tight">
                      {selectedTeamProfile?.displayName || 'Assistant'}
                    </span>
                    <span class="h-1 w-1 rounded-full bg-gray-300" />
                    <span class="text-[10px] font-medium text-gray-400 uppercase tracking-widest">{m.at}</span>
                  </div>
                )}
                
                <div class="flex flex-col gap-3 pl-8">
                  <div class={`relative max-w-[95%] rounded-2xl rounded-tl-sm border px-5 py-4 text-[14px] leading-relaxed shadow-sm transition-all
                    ${m.role === 'system' ? 'border-amber-100 bg-amber-50/30 text-amber-900' : 
                      m.isAck ? 'border-sky-100 bg-sky-50/30 text-sky-900' : 
                      'border-gray-200 bg-white text-gray-800'}`}>
                    
                    <Markdown content={m.text} />
                    
                    {m.steps && <StepLog steps={m.steps} />}
                    
                    {m.role === 'assistant' && m.policy && m.policy.mode !== 'off' ? (
                      <div class="mt-4 flex items-center gap-2">
                        <div class={`h-1.5 w-1.5 rounded-full ${m.policy.state === 'compliant' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                        <span class="text-[11px] font-bold uppercase tracking-widest text-gray-400">
                          Mode {m.policy.mode} · {m.policy.state === 'compliant' ? 'conforme' : 'audit requis'}
                        </span>
                      </div>
                    ) : null}
                    
                    {m.remediation && <RemediationGuide remediation={m.remediation} copyToClipboard={copyToClipboard} />}
                  </div>
                </div>
              </div>
            );
          })}
          {(sending || pollingReply) && (
            <div class="animate-fade-up flex flex-col gap-3">
              <div class="flex items-center gap-2.5 mb-1 opacity-50">
                <div class="h-6 w-6 shrink-0">
                  {selectedTeamProfile && <TeamAvatar profile={selectedTeamProfile} size="xs" />}
                </div>
                <span class="text-xs font-bold text-gray-900 tracking-tight italic">Forge réfléchit...</span>
              </div>
              <div class="pl-8 flex flex-col gap-2">
                <div class="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white/50 px-5 py-4 shadow-sm">
                  <span class="loading loading-dots loading-xs text-gray-400" />
                </div>
                {currentSteps && currentSteps.length > 0 && (
                  <div class="animate-fade-in">
                    <StepLog steps={currentSteps} />
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div ref={chatEndRef} class="h-12 shrink-0" />
      </div>
    </div>
  );
}
