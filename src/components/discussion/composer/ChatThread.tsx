import type { ChatMessage, RoutingDebugState } from './types';
import type { AgentTeamProfile } from '../../../lib/agent-profile';
import TeamAvatar from '../../agents/TeamAvatar';
import RemediationGuide from './RemediationGuide';

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

export default function ChatThread({
  chat, historyLoading, agentId, selectedTeamProfile,
  sending, pollingReply, routingDebug, chatEndRef, copyToClipboard
}: Props) {
  return (
    <div class="relative flex min-h-0 flex-1 flex-col bg-[#ECEFF1]">
      {historyLoading && agentId ? (
        <div class="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#ECEFF1]/85 backdrop-blur-[1px]">
          <span class="loading loading-spinner loading-md text-[#175B37]" />
          <p class="text-xs text-gray-500">Chargement...</p>
        </div>
      ) : null}

      <div class="custom-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto scroll-smooth px-3 py-4 sm:px-5">
        {chat.length === 0 && !historyLoading && (
          <div class="flex flex-1 flex-col items-center justify-center gap-3 px-4 py-12 text-center animate-fade-in">
             <div class="max-w-sm space-y-2">
                <p class="text-base font-semibold text-gray-800">{agentId ? 'Session vide' : 'Prêt'}</p>
             </div>
          </div>
        )}

        <div class="mx-auto w-full max-w-3xl space-y-4">
          {chat.map((m, i) => {
            const prev = i > 0 ? chat[i - 1] : null;
            const showAvatar = (m.role === 'assistant' || m.role === 'system') && (!prev || prev.role === 'user');
            const isUser = m.role === 'user';

            if (isUser) {
              return (
                <div key={m.id} class="animate-fade-up flex justify-end">
                  <div class="max-w-[85%]">
                    <div class="rounded-2xl rounded-br-md bg-white px-4 py-2.5 text-sm shadow-sm">
                      <p class="whitespace-pre-wrap">{m.text}</p>
                    </div>
                    <p class="mt-1 pr-1 text-right text-[11px] text-gray-400">Vous · {m.at}</p>
                  </div>
                </div>
              );
            }

            const bubbleBase = m.role === 'system'
              ? 'rounded-2xl rounded-bl-md bg-amber-50 px-4 py-2.5 text-sm text-amber-950'
              : m.isAck ? 'rounded-2xl rounded-bl-md bg-sky-50 px-4 py-2.5 text-sm text-sky-950'
              : 'rounded-2xl rounded-bl-md bg-gray-100 px-4 py-2.5 text-sm text-gray-800';

            return (
              <div key={m.id} class="animate-fade-up flex justify-start gap-2">
                <div class="w-9 shrink-0 pt-1">
                  {showAvatar && selectedTeamProfile && <TeamAvatar profile={selectedTeamProfile} size="sm" />}
                </div>
                <div class="min-w-0 max-w-[85%] flex-1">
                  <div class={bubbleBase}>
                    <p class="whitespace-pre-wrap">{m.text}</p>
                    {m.remediation && <RemediationGuide remediation={m.remediation} copyToClipboard={copyToClipboard} />}
                  </div>
                  <p class="mt-1 pl-0.5 text-[11px] text-gray-400">{m.at}</p>
                </div>
              </div>
            );
          })}
          {(sending || pollingReply) && (
            <div class="animate-fade-up flex justify-start gap-2">
              <div class="rounded-2xl rounded-bl-md bg-gray-100 px-4 py-3 shadow-sm">...</div>
            </div>
          )}
        </div>
        <div ref={chatEndRef} class="h-2 shrink-0" />
      </div>
    </div>
  );
}
