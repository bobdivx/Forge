import { useState } from "preact/hooks";
import TeamAvatar from "./TeamAvatar";
import AgentConfigModal from "./AgentConfigModal";
import type { AgentTeamProfile } from "../../lib/agent-profile";
import type { SwarmWorkCommand } from "../../lib/forge-agent-protocol";

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
  currentWork?: {
    taskId: number;
    title: string;
    delegatedAgentId?: string;
  } | null;
  sanity?: {
    ok: boolean;
    error?: string;
  };
  raw?: {
    disabledInDb?: boolean;
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
  /** Impulsion visuelle — message / tâche récente sur le flux swarm (~2 min). */
  swarmPulse?: boolean;
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
  swarmPulse = false,
}: Props) {
  const [configOpen, setConfigOpen] = useState(false);
  const stats = taskStats ?? {
    total: 0,
    completed: 0,
    failed: 0,
    running: 0,
    pending: 0,
  };
  const completionPct =
    stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const pendingPct =
    stats.total > 0 ? Math.round((stats.pending / stats.total) * 100) : 0;
  const failedPct =
    stats.total > 0 ? Math.round((stats.failed / stats.total) * 100) : 0;
  const isRunning = stats.running > 0 || Boolean(agent.currentWork);
  const isWorking = isRunning || agent.status === "actif";
  const isDisabled =
    agent.raw?.disabledInDb || /désactiv|desactiv/i.test(agent.status);
  const activityScore =
    stats.running * 6 +
    stats.pending * 2 +
    stats.completed +
    (commandBusy ? 3 : 0);

  let stateLabel = "Veille";
  let statusCls = "border-gray-200 bg-gray-50 text-gray-500";
  let dotCls = "bg-gray-300";
  let glowCls = "opacity-0";

  if (isDisabled) {
    stateLabel = "Désactivé";
    statusCls = "border-gray-200 bg-gray-100 text-gray-400";
    dotCls = "bg-gray-300";
  } else if (isRunning) {
    stateLabel = "En mission";
    statusCls = "border-blue-200 bg-blue-50 text-blue-700";
    dotCls = "bg-blue-500 animate-ping";
    glowCls = "opacity-100";
  } else if (isWorking) {
    stateLabel = "Disponible";
    statusCls = "border-emerald-200 bg-emerald-50 text-emerald-700";
    dotCls = "bg-emerald-500 animate-pulse";
    glowCls = "opacity-70";
  } else if (stats.pending > 0) {
    stateLabel = "File active";
    statusCls = "border-amber-200 bg-amber-50 text-amber-700";
    dotCls = "bg-amber-500";
  }

  const swarmHref = `/swarm/${encodeURIComponent(agent.id)}`;

  return (
    <div
      class={`group relative flex min-h-[260px] flex-col overflow-hidden rounded-[1.65rem] border bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
        isRunning
          ? "border-blue-200 shadow-blue-100/70 ring-1 ring-blue-100"
          : isWorking
            ? "border-emerald-200 shadow-emerald-50"
            : "border-gray-100 hover:border-gray-200"
      }`}
    >
      <div
        class={`pointer-events-none absolute -right-10 -top-12 h-28 w-28 rounded-full bg-blue-400/20 blur-2xl transition-opacity duration-500 ${glowCls}`}
      />
      <div class="absolute inset-x-0 top-0 h-1 bg-gray-100">
        <div
          class={`h-full rounded-r-full transition-all duration-700 ${
            isRunning
              ? "bg-blue-500 shadow-[0_0_16px_rgba(59,130,246,0.7)]"
              : isWorking
                ? "bg-emerald-500"
                : "bg-gray-300"
          }`}
          style={{ width: `${Math.min(100, Math.max(8, activityScore * 8))}%` }}
        />
      </div>

      <a
        href={swarmHref}
        class="block flex-1 p-4 pb-3 text-inherit no-underline"
      >
        <div class="mb-3 flex items-start justify-between gap-3">
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div class="relative shrink-0">
              {swarmPulse && (
                <div class="pointer-events-none absolute -inset-1 z-[5] rounded-full bg-emerald-400/25 animate-ping" />
              )}
              <div
                class={`absolute inset-0 scale-125 rounded-full bg-blue-500/20 blur-md transition-opacity ${glowCls}`}
              />
              <TeamAvatar
                profile={teamProfile}
                size="md"
                class="relative z-10 shadow-sm ring-4 ring-white"
              />
              <div
                class={`absolute -bottom-0.5 -right-0.5 z-20 h-3.5 w-3.5 rounded-full border-[3px] border-white ${dotCls}`}
              />
            </div>
            <div class="min-w-0 flex-1">
              <div
                class={`mb-1.5 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-widest ${statusCls}`}
              >
                {stateLabel}
              </div>
              <h3 class="truncate text-sm font-black text-gray-900 transition-colors group-hover:text-[#175B37]">
                {teamProfile.displayName}
              </h3>
              <p class="mt-1 truncate text-[9px] font-bold uppercase tracking-widest text-gray-400">
                {teamProfile.role}
              </p>
            </div>
          </div>
          {isRunning && (
            <span class="inline-flex shrink-0 items-center gap-1 rounded-full bg-blue-600 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-sm">
              Live
            </span>
          )}
        </div>

        <div class="mb-3 flex items-center justify-between gap-2 rounded-2xl border border-gray-100 bg-gray-50/70 px-3 py-2">
          <div class="min-w-0">
            <p class="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Modèle
            </p>
            <p class="truncate text-[11px] font-semibold text-gray-800">
              {agent.model || "Auto"}
            </p>
          </div>
          <div class="text-right">
            <p class="text-[9px] font-black uppercase tracking-widest text-gray-400">
              Activité
            </p>
            <p class="text-sm font-black text-gray-900">{activityScore}</p>
          </div>
        </div>

        {(stats.running > 0 || agent.currentWork) && (
          <div class="mb-3 rounded-2xl border border-blue-100 bg-blue-50/90 px-3 py-2 text-left shadow-sm">
            <p class="mb-1 text-[9px] font-black uppercase tracking-wider text-blue-700">
              Mission en cours
            </p>
            <p
              class="line-clamp-2 text-[11px] font-semibold leading-snug text-gray-900"
              title={agent.currentWork?.title || ""}
            >
              {agent.currentWork?.title ||
                (stats.running > 0
                  ? `${stats.running} mission(s) marquée(s) running — ouvrez la chronologie pour le détail`
                  : "—")}
            </p>
            {agent.currentWork?.delegatedAgentId && (
              <p
                class="mt-1 truncate font-mono text-[9px] text-blue-800/80"
                title={agent.currentWork.delegatedAgentId}
              >
                Délégué · {agent.currentWork.delegatedAgentId}
              </p>
            )}
          </div>
        )}

        <div class="mb-3 grid grid-cols-4 gap-1.5">
          <div class="rounded-xl border border-gray-100 bg-gray-50/80 p-2 text-center">
            <div class="text-sm font-black text-gray-900">{stats.total}</div>
            <div class="mt-0.5 text-[7px] font-bold uppercase tracking-widest text-gray-400">
              Total
            </div>
          </div>
          <div class="rounded-xl border border-blue-100 bg-blue-50/70 p-2 text-center">
            <div class="text-sm font-black text-blue-600">{stats.running}</div>
            <div class="mt-0.5 text-[7px] font-bold uppercase tracking-widest text-blue-400">
              Run
            </div>
          </div>
          <div class="rounded-xl border border-emerald-100 bg-emerald-50/70 p-2 text-center">
            <div class="text-sm font-black text-emerald-600">
              {stats.completed}
            </div>
            <div class="mt-0.5 text-[7px] font-bold uppercase tracking-widest text-emerald-400">
              OK
            </div>
          </div>
          <div class="rounded-xl border border-rose-100 bg-rose-50/70 p-2 text-center">
            <div class="text-sm font-black text-rose-600">{stats.failed}</div>
            <div class="mt-0.5 text-[7px] font-bold uppercase tracking-widest text-rose-400">
              Fail
            </div>
          </div>
        </div>

        {stats.total > 0 ? (
          <div>
            <div class="mb-1.5 flex items-center justify-between">
              <span class="text-[9px] font-black uppercase tracking-widest text-gray-400">
                Flux missions
              </span>
              <span class="text-[10px] font-black text-gray-900">
                {completionPct}% OK
              </span>
            </div>
            <div class="flex h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                class="h-full bg-blue-500 transition-all duration-700"
                style={{
                  width: `${stats.total > 0 ? Math.round((stats.running / stats.total) * 100) : 0}%`,
                }}
              />
              <div
                class="h-full bg-amber-400 transition-all duration-700"
                style={{ width: `${pendingPct}%` }}
              />
              <div
                class="h-full bg-emerald-500 transition-all duration-700"
                style={{ width: `${completionPct}%` }}
              />
              <div
                class="h-full bg-rose-500 transition-all duration-700"
                style={{ width: `${failedPct}%` }}
              />
            </div>
          </div>
        ) : (
          <div class="flex h-8 items-center justify-center">
            <span class="text-[10px] font-bold text-gray-300 uppercase tracking-widest">
              En attente de mission
            </span>
          </div>
        )}

        {commandMessage && (
          <div class="mt-3 rounded-xl border border-blue-100/70 bg-blue-50/70 p-2 text-center text-[10px] font-semibold text-blue-600 animate-pulse">
            {commandMessage}
          </div>
        )}
      </a>

      <div class="flex items-center justify-between gap-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3">
        <div class="flex items-center gap-1">
          {(["start_work", "stop_work"] as SwarmWorkCommand[]).map((cmd) => (
            <button
              key={cmd}
              onClick={() => onSwarmCommand?.(agent.id, cmd)}
              disabled={commandBusy}
              class={`rounded-xl border p-2 transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37] focus-visible:ring-offset-1 ${cmd === "start_work" ? "bg-gray-900 border-gray-900 text-white hover:bg-black" : "bg-white border-gray-200 text-gray-400 hover:text-rose-500 hover:border-rose-200"}`}
              title={cmd === "start_work" ? "Lancer une mission" : "Arrêter"}
              aria-label={
                cmd === "start_work" ? "Lancer une mission" : "Arrêter"
              }
            >
              {cmd === "start_work" ? (
                <svg
                  class="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                    d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                  />
                </svg>
              ) : (
                <svg
                  class="w-3.5 h-3.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden="true"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2.5"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              )}
            </button>
          ))}
          <button
            onClick={(e) => {
              e.preventDefault();
              setConfigOpen(true);
            }}
            class="rounded-xl border border-gray-200 bg-white p-2 text-gray-400 transition-all hover:border-[#175B37]/30 hover:text-[#175B37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37] focus-visible:ring-offset-1"
            title="Configurer cet agent (outils, prompt)"
            aria-label="Configurer cet agent"
          >
            <svg
              class="h-3.5 w-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </button>
        </div>
        <div class="flex min-w-0 flex-col items-end">
          <div class="max-w-[160px] truncate text-[9px] font-black text-gray-400">
            {wakeStatusLabel || stateLabel}
          </div>
          <div class="mt-0.5 max-w-[145px]" onClick={(e) => e.preventDefault()}>
            <select
              class="max-w-full cursor-pointer appearance-none truncate border-none bg-transparent pr-2 text-right font-mono text-[9px] text-gray-500 outline-none hover:text-gray-900"
              value={agent.model || "Auto"}
              onChange={(e) =>
                onModelChange?.(
                  agent.id,
                  (e.currentTarget as HTMLSelectElement).value,
                )
              }
              title="Modifier le modèle"
            >
              <option value={agent.model}>{agent.model || "Modèle"}</option>
              <option value="Auto">Auto (Recommandé)</option>
              <option value="qwen2.5-coder:7b">qwen2.5-coder:7b</option>
              <option value="deepseek-r1:8b">deepseek-r1:8b</option>
            </select>
          </div>
          <div class="text-[9px] font-bold text-emerald-500 tabular-nums">
            ${(agent.estimatedCostUsd ?? 0).toFixed(4)}
          </div>
        </div>
      </div>
      <AgentConfigModal
        agentId={agent.id}
        open={configOpen}
        onClose={() => setConfigOpen(false)}
      />
    </div>
  );
}
