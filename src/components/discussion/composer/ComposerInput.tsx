import type { SwarmWorkCommand } from '../../../lib/forge-agent-protocol';
import { SWARM_WORK_COMMAND_LABELS } from '../../../lib/forge-agent-protocol';

interface Props {
  message: string;
  setMessage: (m: string | ((prev: string) => string)) => void;
  sending: boolean;
  historyLoading: boolean;
  sessionUnavailable: boolean;
  agentId: string;
  send: () => Promise<void>;
  applySwarmCommand: (cmd: SwarmWorkCommand) => void;
  swarmCommandMode: 'direct' | 'leader';
  setSwarmCommandMode: (mode: 'direct' | 'leader' | ((prev: 'direct' | 'leader') => 'direct' | 'leader')) => void;
}

export default function ComposerInput({
  message, setMessage, sending, historyLoading, sessionUnavailable, agentId,
  send, applySwarmCommand, swarmCommandMode, setSwarmCommandMode
}: Props) {
  return (
    <div class="sticky bottom-0 z-20 shrink-0 border-t border-gray-200 bg-white/95 p-3 backdrop-blur sm:p-4" style="padding-bottom: max(0.75rem, env(safe-area-inset-bottom));">
      <div class="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-2">
        <span class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Commandes</span>
        {(['start_work', 'pause_work', 'resume_work', 'stop_work'] as SwarmWorkCommand[]).map((cmd) => (
          <button
            key={cmd}
            type="button"
            class="min-h-[36px] rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] hover:bg-[#E9F3EB]"
            onClick={() => applySwarmCommand(cmd)}
            disabled={sending || historyLoading}
          >
            {SWARM_WORK_COMMAND_LABELS[cmd]}
          </button>
        ))}
        <button
          type="button"
          class={`ml-auto min-h-[36px] rounded-full border px-3 py-1 text-[11px] font-medium ${swarmCommandMode === 'leader' ? 'bg-[#E9F3EB]' : 'bg-white'}`}
          onClick={() => setSwarmCommandMode(m => m === 'leader' ? 'direct' : 'leader')}
          disabled={sending || historyLoading}
        >
          mode {swarmCommandMode}
        </button>
      </div>
      <div class="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
        <textarea
          class="max-h-40 min-h-[48px] flex-1 resize-none border-0 bg-transparent px-2 py-2 text-sm outline-none disabled:opacity-50"
          placeholder="Message… (/help pour les commandes)"
          value={message}
          onInput={(e) => setMessage((e.target as HTMLTextAreaElement).value)}
          disabled={sending || historyLoading || sessionUnavailable}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={sending || historyLoading || sessionUnavailable || !message.trim() || !agentId}
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#175B37] text-white disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37] focus-visible:ring-offset-2"
          aria-label="Envoyer le message"
          title="Envoyer le message"
        >
          <span aria-hidden="true">&gt;</span>
        </button>
      </div>
    </div>
  );
}
