import TeamAvatar from './TeamAvatar';
import type { AgentTeamProfile } from '../../lib/agent-profile';

type Runtime = {
  status: string;
  model: string;
  totalTokens: number;
  estimatedCostUsd: number;
  lastSeen: string;
};

type SubRow = {
  agentId: string;
  model: string;
  enabled: number;
  projectLabel: string;
};

type Props = {
  teamProfile: AgentTeamProfile;
  displayCode: string;
  /** Clé technique de session côté gateway (souvent identique à l’id Forge). */
  sessionKey: string;
  agentRuntime: Runtime;
  /** Données live gateway vs instruction Forge en base. */
  runtimeSource: 'gateway' | 'forge';
  /** Au moins une ligne `AgentInstruction` pour cet id. */
  hasForgeInstruction: boolean;
  subagents: SubRow[];
  /** Si non-null, cette fiche est un sous-agent `…__APP_…` — pas de liste d’équipe imbriquée. */
  parentAgentId: string | null;
};

function presenceDot(cls: string) {
  return <span class={`h-2 w-2 shrink-0 rounded-full ${cls}`} aria-hidden />;
}

export default function AgentSwarmEmployeeProfile({
  teamProfile,
  displayCode,
  sessionKey,
  agentRuntime,
  runtimeSource,
  hasForgeInstruction,
  subagents,
  parentAgentId,
}: Props) {
  const presenceCls =
    teamProfile.presence === 'online'
      ? 'bg-emerald-500'
      : teamProfile.presence === 'away'
        ? 'bg-amber-400'
        : 'bg-gray-300';

  return (
    <div class="space-y-6">
      {parentAgentId ? (
        <nav class="flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <a
            href={`/swarm/${encodeURIComponent(parentAgentId)}`}
            class="inline-flex items-center gap-1.5 font-medium text-[#175B37] hover:underline"
          >
            <svg class="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
            </svg>
            Agent parent ({parentAgentId})
          </a>
          <span aria-hidden class="text-gray-300">
            /
          </span>
          <span class="text-gray-700">Sous-agent applicatif</span>
        </nav>
      ) : null}

      <div class="overflow-hidden rounded-[2rem] border border-[#175B37]/15 bg-gradient-to-br from-[#f4faf6] via-white to-white shadow-sm">
        <div class="grid gap-8 p-6 md:p-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
          <div class="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div class="relative shrink-0">
              <TeamAvatar profile={teamProfile} size="lg" class="h-24 w-24 text-xl shadow-lg ring-4 ring-white" />
              <div
                class="absolute -bottom-1 -right-1 flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-[#175B37] text-[11px] shadow-md"
                title="Collaborateur IA"
              >
                <span aria-hidden>✦</span>
              </div>
            </div>

            <div class="min-w-0 flex-1 space-y-3">
              <div class="flex flex-wrap items-center gap-2">
                <h1 class="text-2xl font-black tracking-tight text-gray-900 md:text-3xl">
                  {teamProfile.displayName}
                </h1>
                <span
                  class="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-violet-800"
                  title="Collaborateur numérique (LLM)"
                >
                  Collaborateur IA
                </span>
              </div>

              <p class="text-sm font-semibold text-[#175B37]">{teamProfile.role}</p>

              <div class="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                {presenceDot(presenceCls)}
                <span class="font-medium text-gray-800">{teamProfile.presenceLabel}</span>
                <span class="text-gray-300" aria-hidden>
                  ·
                </span>
                {runtimeSource === 'gateway' ? (
                  <span>Session gateway (live) : {agentRuntime.status}</span>
                ) : hasForgeInstruction ? (
                  <span class="text-gray-600">
                    <strong class="font-semibold text-[#175B37]">Forge</strong> — modèle et activation via l’instruction
                    (tokens / coût live si le gateway expose une session).
                  </span>
                ) : (
                  <span class="text-amber-800">
                    Aucune instruction en base pour cet identifiant — ajoutez l’agent dans Forge pour le gérer comme le
                    reste de l’équipe.
                  </span>
                )}
              </div>

              {teamProfile.bio ? (
                <p class="max-w-2xl text-sm leading-relaxed text-gray-600 border-l-2 border-[#175B37]/25 pl-4">
                  {teamProfile.bio}
                </p>
              ) : (
                <p class="max-w-2xl text-xs italic text-gray-400">
                  Pas de note d’équipe — enrichissez la fiche dans les instructions agent ou le profil équipe.
                </p>
              )}

              <dl class="flex flex-wrap gap-x-6 gap-y-2 border-t border-gray-100/80 pt-4 text-[11px] text-gray-500">
                <div>
                  <dt class="font-bold uppercase tracking-wider text-gray-400">Identifiant Forge</dt>
                  <dd class="font-mono text-gray-800">{displayCode}</dd>
                </div>
                {String(sessionKey || '').trim() !== String(displayCode || '').trim() ? (
                  <div>
                    <dt class="font-bold uppercase tracking-wider text-gray-400">Clé session (gateway)</dt>
                    <dd class="break-all font-mono text-gray-700" title="Identifiant technique côté orchestrateur — peut différer de l’id Forge.">
                      {sessionKey}
                    </dd>
                  </div>
                ) : null}
                {!(runtimeSource === 'forge' && hasForgeInstruction) ? (
                  <div>
                    <dt class="font-bold uppercase tracking-wider text-gray-400">Modèle (profil)</dt>
                    <dd class="font-mono text-blue-600">{teamProfile.modelShort}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 rounded-2xl border border-gray-100 bg-white/90 p-4 shadow-inner sm:grid-cols-2 lg:grid-cols-1">
            <div>
              <p class="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                {runtimeSource === 'gateway' ? 'Modèle (live)' : 'Modèle (instruction)'}
              </p>
              <p class="mt-1 truncate font-mono text-sm text-blue-600">
                {String(agentRuntime.model || '—')
                  .split('/')
                  .pop()}
              </p>
            </div>
            <div>
              <p class="text-[9px] font-bold uppercase tracking-wider text-gray-400">Tokens</p>
              <p class="mt-1 font-mono text-sm text-gray-900">
                {runtimeSource === 'gateway'
                  ? agentRuntime.totalTokens.toLocaleString('fr-FR')
                  : '—'}
              </p>
            </div>
            <div>
              <p class="text-[9px] font-bold uppercase tracking-wider text-gray-400">Coût estimé</p>
              <p class="mt-1 font-mono text-sm" style={{ color: '#3BAE61' }}>
                {runtimeSource === 'gateway' ? `$${agentRuntime.estimatedCostUsd.toFixed(2)}` : '—'}
              </p>
            </div>
            <div>
              <p class="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                {runtimeSource === 'gateway' ? 'Dernière activité (live)' : 'Dernière MAJ instruction'}
              </p>
              <p class="mt-1 font-mono text-xs text-gray-600">{agentRuntime.lastSeen}</p>
            </div>
            {runtimeSource === 'forge' && hasForgeInstruction ? (
              <p class="col-span-2 text-[9px] leading-snug text-gray-400">
                Tokens / coût : affichés quand une session gateway est visible pour cet agent.
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {!parentAgentId ? (
        <section class="rounded-[1.5rem] border border-gray-100 bg-white p-5 shadow-sm">
          <div class="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 class="text-sm font-bold text-gray-900">Sous-agents applicatifs</h2>
              <p class="mt-1 max-w-2xl text-[11px] leading-relaxed text-gray-500">
                Instances dédiées par dépôt Forge (<code class="rounded bg-gray-50 px-1 font-mono text-[10px]">__APP_</code>
                ). Elles héritent du prompt parent avec un périmètre projet ; ouvrez une fiche pour piloter ou suivre une
                mission ciblée.
              </p>
            </div>
          </div>

          {subagents.length === 0 ? (
            <p class="rounded-xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-6 text-center text-xs text-gray-500">
              Aucun sous-agent pour cet agent. Ils apparaissent lorsque Forge provisionne un scope projet (missions «
              Mettre au travail » sur une application, ou tâches orchestrées avec dépôt cible).
            </p>
          ) : (
            <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {subagents.map((s) => (
                <li key={s.agentId}>
                  <a
                    href={`/swarm/${encodeURIComponent(s.agentId)}`}
                    class="block rounded-2xl border border-gray-100 bg-gray-50/50 p-4 transition hover:border-[#175B37]/35 hover:bg-white hover:shadow-md"
                  >
                    <div class="flex items-start justify-between gap-2">
                      <p class="text-xs font-bold text-gray-900">{s.projectLabel}</p>
                      <span
                        class={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                          s.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {s.enabled ? 'Actif' : 'Off'}
                      </span>
                    </div>
                    <p class="mt-2 truncate font-mono text-[10px] text-gray-500">{s.agentId}</p>
                    <p class="mt-1 font-mono text-[10px] text-blue-600">{s.model.split('/').pop() || s.model}</p>
                  </a>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <p class="rounded-[1.5rem] border border-gray-100 bg-gray-50/60 px-5 py-4 text-xs text-gray-600">
          Fiche <strong>sous-agent applicatif</strong> : le périmètre est limité à un dépôt. Les sous-agents imbriqués ne
          sont pas utilisés — les missions et le pilotage restent sur cette fiche ou sur l’agent parent ci-dessus.
        </p>
      )}
    </div>
  );
}
