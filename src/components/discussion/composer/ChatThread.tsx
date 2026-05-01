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
}

function StepLog({ steps }: { steps: ChatMessage['steps'] }) {
  const [open, setOpen] = useState(false);
  if (!steps || steps.length === 0) return null;

  const getIcon = (s: any) => {
    if (s.label?.toLowerCase().includes('explor')) return 'Explored';
    if (s.label?.toLowerCase().includes('modif') || s.label?.toLowerCase().includes('edit')) return 'Edited';
    if (s.label?.toLowerCase().includes('command') || s.label?.toLowerCase().includes('ran')) return 'Ran';
    if (s.label?.toLowerCase().includes('thought') || s.label?.toLowerCase().includes('réfléchi')) return 'Thought';
    if (s.type === 'llm') return 'LLM';
    if (s.label?.toLowerCase().includes('plan')) return 'Plan';
    return 'Action';
  };

  const getLabel = (s: any) => {
    if (s.label?.toLowerCase().includes('plan_detected')) return 'Plan de travail détecté';
    if (s.label?.toLowerCase().includes('ollama_chat')) return 'Génération de la réponse';
    return s.label;
  };

  return (
    <div class="mt-4 space-y-2 border-l-2 border-gray-100 pl-3">
      {steps.filter(s => s.type !== 'policy' || s.label === 'plan_detected').map((s, idx) => (
        <div key={idx} class="group flex items-center gap-2 text-[12px] text-gray-500 transition-colors hover:text-gray-800">
          <span class="font-medium">{getIcon(s)}</span>
          <span class="flex-1 truncate font-mono text-gray-400 group-hover:text-gray-600">
            {getLabel(s)}
            {s.payload && s.payload !== 'ok' && s.payload !== 'running' && (
              <span class="ml-2 opacity-60">({s.payload.slice(0, 50)})</span>
            )}
          </span>
          <svg class="h-3 w-3 opacity-0 group-hover:opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      ))}
    </div>
  );
}

export default function ChatThread({
  chat, historyLoading, agentId, selectedTeamProfile,
  sending, pollingReply, routingDebug, chatEndRef, copyToClipboard
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
              <div class="pl-8">
                <div class="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white/50 px-5 py-4 shadow-sm">
                  <span class="loading loading-dots loading-xs text-gray-400" />
                </div>
              </div>
            </div>
          )}
        </div>
        <div ref={chatEndRef} class="h-12 shrink-0" />
      </div>
    </div>
  );
}
