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
  totalTokens?: number;
  estimatedCostUsd?: number;
  sanity?: {
    ok: boolean;
    error?: string;
  };
};

type Props = {
  agent: Agent;
  taskStats?: TaskStats;
  teamProfile: AgentTeamProfile;
  onSwarmCommand?: (agentId: string, command: SwarmWorkCommand) => void;
  onModelChange?: (agentId: string, newModel: string) => void;
  commandBusy?: boolean;
  commandMessage?: string | null;
  wakeStatusLabel?: string;
};

export default function AgentCard({
  agent,
  taskStats,
  teamProfile,
  onSwarmCommand,
  commandBusy = false,
  commandMessage = null,
  wakeStatusLabel,
  onModelChange,
}: Props) {
  const stats = taskStats ?? { total: 0, completed: 0, failed: 0, running: 0, pending: 0 };
  const completionPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const isWorking = stats.running > 0 || agent.status === 'actif';
  const isHealthy = agent.sanity?.ok;
  
  let statusLabel = wakeStatusLabel || "ACTIF";
  let statusCls = "bg-emerald-50 text-emerald-700 border-emerald-100";
  let dotCls = "bg-emerald-500";

  if (isWorking) {
    statusLabel = wakeStatusLabel || "EN TRAVAIL";
    statusCls = "bg-blue-50 text-blue-700 border-blue-100";
    dotCls = "bg-blue-500 animate-pulse";
  } else if (!isHealthy) {
    statusLabel = wakeStatusLabel || "CRÉÉ";
    statusCls = "bg-amber-50 text-amber-700 border-amber-100";
    dotCls = "bg-amber-500";
  }

  const swarmHref = `/swarm/${encodeURIComponent(agent.id)}`;

  return (
    <div class={`group flex flex-col overflow-hidden rounded-[2.5rem] border transition-all duration-500 ${isWorking ? 'border-blue-200 shadow-xl shadow-blue-100/40 bg-blue-50/5' : 'border-gray-100 bg-white hover:border-gray-200 shadow-sm'}`}>
      <a href={swarmHref} class="block flex-1 p-7 text-inherit no-underline">
        <div class="mb-6 flex items-start justify-between gap-4">
          <div class="flex min-w-0 flex-1 items-center gap-5">
            <div class="relative shrink-0">
              <div class="absolute inset-0 bg-blue-500/10 rounded-full scale-110 blur-md opacity-0 group-hover:opacity-100 transition-opacity" />
              <TeamAvatar profile={teamProfile} size="lg" class="shadow-lg ring-4 ring-white relative z-10" />
              <div class={`absolute -bottom-1 -right-1 h-4.5 w-4.5 rounded-full border-4 border-white z-20 ${dotCls}`} />
            </div>
            <div class="min-w-0 flex-1">
              <div class={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[9px] font-black tracking-widest mb-2.5 ${statusCls}`}>
                {statusLabel}
              </div>
              <h3 class="truncate text-lg font-black text-gray-900 transition-colors group-hover:text-blue-600">
                {teamProfile.displayName}
              </h3>
              <p class="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none mt-1">{teamProfile.role}</p>
            </div>
          </div>
        </div>

        {teamProfile.bio ? (
          <p class="mb-6 line-clamp-2 text-xs leading-relaxed text-gray-500 font-medium italic opacity-80">"{teamProfile.bio}"</p>
        ) : <div class="mb-6 h-[40px]" />}

        <div class="grid grid-cols-3 gap-3 mb-7">
          <div class="bg-gray-50/50 rounded-2xl p-3 border border-gray-100/50 text-center transition-transform group-hover:-translate-y-0.5">
            <div class="text-base font-black text-gray-900">{stats.total}</div>
            <div class="text-[8px] font-bold text-gray-400 uppercase tracking-widest mt-1">Missions</div>
          </div>
          <div class="bg-emerald-50/40 rounded-2xl p-3 border border-emerald-100/50 text-center transition-transform group-hover:-translate-y-0.5 delay-75">
            <div class="text-base font-black text-emerald-600">{stats.completed}</div>
            <div class="text-[8px] font-bold text-emerald-400 uppercase tracking-widest mt-1">Succès</div>
          </div>
          <div class="bg-rose-50/40 rounded-2xl p-3 border border-rose-100/50 text-center transition-transform group-hover:-translate-y-0.5 delay-150">
            <div class="text-base font-black text-rose-600">{stats.failed}</div>
            <div class="text-[8px] font-bold text-rose-400 uppercase tracking-widest mt-1">Échecs</div>
          </div>
        </div>

        {stats.total > 0 ? (
          <div class="mb-2">
            <div class="flex justify-between items-center mb-2.5">
              <span class="text-[9px] font-black text-gray-400 uppercase tracking-widest">Performance</span>
              <span class="text-[11px] font-black text-gray-900">{completionPct}%</span>
            </div>
            <div class="h-2 w-full bg-gray-100 rounded-full overflow-hidden p-0.5">
              <div class="h-full bg-emerald-500 rounded-full transition-all duration-1000 shadow-[0_0_8px_rgba(16,185,129,0.4)]" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        ) : (
          <div class="h-10 flex items-center justify-center">
            <span class="text-[10px] font-bold text-gray-300 uppercase tracking-widest">En attente de mission</span>
          </div>
        )}

        {commandMessage && (
          <div class="mt-4 rounded-xl bg-blue-50/50 p-2 text-center text-[10px] font-medium text-blue-600 border border-blue-100/50 animate-pulse">
            {commandMessage}
          </div>
        )}
      </a>

      <div class="flex items-center justify-between gap-3 border-t border-gray-50 bg-gray-50/30 px-6 py-4">
        <div class="flex items-center gap-1.5">
          {(['start_work', 'stop_work'] as SwarmWorkCommand[]).map((cmd) => (
            <button
              key={cmd}
              onClick={() => onSwarmCommand?.(agent.id, cmd)}
              disabled={commandBusy}
              class={`p-2 rounded-xl border transition-all ${cmd === 'start_work' ? 'bg-gray-900 border-gray-900 text-white hover:bg-black' : 'bg-white border-gray-200 text-gray-400 hover:text-rose-500 hover:border-rose-200'}`}
              title={cmd === 'start_work' ? 'Lancer une mission' : 'Arrêter'}
            >
              {cmd === 'start_work' ? (
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /></svg>
              ) : (
                <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              )}
            </button>
          ))}
        </div>
        <div class="flex flex-col items-end">
          <div class="text-[10px] font-black text-gray-900">{((agent.totalTokens ?? 0) / 1000).toFixed(1)}K tokens</div>
          <div class="mt-1" onClick={e => e.preventDefault()}>
            <select
              class="text-[9px] font-mono text-gray-500 bg-transparent border-none outline-none appearance-none cursor-pointer hover:text-gray-900 text-right pr-2"
              value={agent.model || "Auto"}
              onChange={e => onModelChange?.(agent.id, e.target.value)}
              title="Modifier le modèle (nécessite une sauvegarde globale)"
            >
              <option value={agent.model}>{agent.model || "Modèle"}</option>
              <option value="Auto">Auto (Recommandé)</option>
              <option value="qwen2.5-coder:7b">qwen2.5-coder:7b</option>
              <option value="deepseek-r1:8b">deepseek-r1:8b</option>
            </select>
          </div>
          <div class="text-[9px] font-bold text-emerald-500 tabular-nums">${(agent.estimatedCostUsd ?? 0).toFixed(4)}</div>
        </div>
      </div>
    </div>
  );
}
