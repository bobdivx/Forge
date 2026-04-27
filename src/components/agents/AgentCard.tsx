import TeamAvatar from './TeamAvatar';
import type { AgentTeamProfile } from '../../lib/agent-profile';
import type { SwarmWorkCommand } from '../../lib/forge-agent-protocol';

type TaskStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
};

type Agent = {
  id: string;
  name: string;
  status: string;
  model: string;
  contextTokens?: number | null;
  totalTokens?: number;
  estimatedCostUsd?: number;
  runtimeMs?: number;
  lastSeen?: string;
  lastSeenMs?: number;
  raw?: {
    offline?: boolean;
    disabledInDb?: boolean;
    registryOnly?: boolean;
    reason?: string;
  };
};

type Props = {
  agent: Agent;
  taskStats?: TaskStats;
  teamProfile: AgentTeamProfile;
  onSwarmCommand?: (agentId: string, command: SwarmWorkCommand) => void;
  commandBusy?: boolean;
  commandMessage?: string | null;
  wakeStatusLabel?: string;
};

export { formatAgentName, getAgentRole } from '../../lib/agent-profile';

function truncateText(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, Math.max(0, max - 1))}…`;
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div class="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#3BAE61' }} />
    </div>
  );
}

export default function AgentCard({
  agent,
  taskStats,
  teamProfile,
  onSwarmCommand,
  commandBusy = false,
  commandMessage = null,
  wakeStatusLabel,
}: Props) {
  const stats = taskStats ?? { total: 0, completed: 0, failed: 0, running: 0, pending: 0 };
  const completionPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const presenceDot =
    teamProfile.presence === 'online'
      ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.25)]'
      : teamProfile.presence === 'offline'
        ? 'bg-gray-300'
        : 'bg-amber-400';

  const swarmHref = `/swarm/${encodeURIComponent(agent.id)}`;

  return (
    <div class="group flex flex-col overflow-hidden rounded-[1.5rem] border border-gray-100 bg-white shadow-sm transition-all duration-200 hover:border-gray-200 hover:shadow-md">
      <a href={swarmHref} class="block flex-1 p-5 text-inherit no-underline">
        <div class="mb-4 flex items-start justify-between gap-2">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="relative shrink-0">
              <TeamAvatar profile={teamProfile} size="md" class="shadow-inner ring-2 ring-white" />
              <span
                class={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white ${presenceDot}`}
                title={teamProfile.presenceLabel}
                aria-hidden="true"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-1.5">
                <h3 class="truncate text-sm font-bold text-gray-900 transition-colors group-hover:text-[#175B37]">
                  {teamProfile.displayName}
                </h3>
                <span class="shrink-0 rounded-full bg-[#E9F3EB] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#175B37]">
                  ZimaOS
                </span>
              </div>
              <p class="mt-0.5 truncate text-[10px] text-gray-500">{teamProfile.role}</p>
              <p class="mt-0.5 truncate font-mono text-[9px] text-gray-400" title={agent.id}>
                {truncateText(agent.id, 44)}
              </p>
            </div>
          </div>
          <div class="flex shrink-0 flex-col items-end gap-0.5">
            <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500">{teamProfile.presenceLabel}</span>
            <span class="text-[9px] font-mono text-gray-400">{teamProfile.modelShort}</span>
          </div>
        </div>

        {teamProfile.bio ? (
          <p class="mb-4 line-clamp-2 text-[11px] leading-snug text-gray-600">{teamProfile.bio}</p>
        ) : null}

        <div class="mb-4 grid grid-cols-3 gap-2">
          {[
            { v: stats.total, label: 'Tâches', color: '#1F2937' },
            { v: stats.completed, label: 'Terminées', color: '#3BAE61' },
            { v: stats.failed, label: 'Erreurs', color: '#EF4444' },
          ].map(({ v, label, color }) => (
            <div key={label} class="rounded-xl border border-gray-100 bg-gray-50 p-2 text-center">
              <div class="text-base font-bold tabular-nums" style={{ color }}>
                {v}
              </div>
              <div class="mt-0.5 text-[9px] uppercase tracking-wider text-gray-400">{label}</div>
            </div>
          ))}
        </div>

        {stats.total > 0 && (
          <div class="mb-4">
            <div class="mb-1 flex items-center justify-between">
              <span class="text-[10px] text-gray-400">Complétion</span>
              <span class="text-[10px] font-mono text-gray-600">{completionPct}%</span>
            </div>
            <ProgressBar value={stats.completed} max={stats.total} />
          </div>
        )}

        <div class="flex items-center justify-between border-t border-gray-100 pt-3">
          <span class="text-[10px] text-gray-400">{((agent.totalTokens ?? 0) / 1000).toFixed(1)}K tokens</span>
          {(agent.estimatedCostUsd ?? 0) > 0 && (
            <span class="text-[10px] font-mono font-bold" style={{ color: '#3BAE61' }}>
              ${agent.estimatedCostUsd!.toFixed(3)}
            </span>
          )}
          <div class="text-gray-400 transition-all group-hover:translate-x-0.5 group-hover:text-[#175B37]">
            <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
          </div>
        </div>
        {wakeStatusLabel ? (
          <div class="mt-2">
            <span class="inline-flex max-w-full items-center rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600">
              {wakeStatusLabel}
            </span>
          </div>
        ) : null}
      </a>

      <div class="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/80 px-4 py-2.5">
        <div class="flex flex-wrap items-center gap-1">
          {(['start_work', 'pause_work', 'stop_work'] as SwarmWorkCommand[]).map((cmd) => (
            <button
              key={cmd}
              type="button"
              onClick={() => onSwarmCommand?.(agent.id, cmd)}
              disabled={commandBusy}
              class="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-gray-700 transition hover:border-[#175B37]/30 hover:bg-[#E9F3EB] disabled:opacity-50"
              title={cmd === 'start_work' ? 'Démarrer (start work)' : cmd === 'pause_work' ? 'Pause (pause work)' : 'Arrêter (stop work)'}
              aria-label={cmd === 'start_work' ? 'Démarrer' : cmd === 'pause_work' ? 'Pause' : 'Arrêter'}
            >
              {cmd === 'start_work' ? (
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : cmd === 'pause_work' ? (
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
                </svg>
              ) : (
                <svg class="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M6 6h12v12H6z" />
                </svg>
              )}
            </button>
          ))}
          <a href="/discussion" class="ml-1 text-[11px] font-semibold text-[#175B37] transition hover:underline">
            Message
          </a>
        </div>
        <div class="max-w-[48%] text-right">
          <span class="block truncate font-mono text-[9px] text-gray-400" title={agent.id}>
            {truncateText(agent.id, 28)}
          </span>
          {commandMessage ? <span class="block truncate text-[9px] text-gray-500">{commandMessage}</span> : null}
        </div>
      </div>
    </div>
  );
}
