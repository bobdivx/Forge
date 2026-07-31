import type { AgentTeamProfile } from '../../../lib/agent-profile';
import type { Project, RequestItem } from './types';
import TeamAvatar from '../../agents/TeamAvatar';
import { truncateText } from './types';

interface Props {
  selectedTeamProfile?: AgentTeamProfile;
  selectedAgentId?: string;
  selectedProject?: Project;
  selectedRequest?: RequestItem;
  setHeaderMenuOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  headerMenuOpen: boolean;
  copyToClipboard: (text: string) => Promise<void>;
  /** Clic sur la zone « Sélectionnez un membre » (liste agents / scroll vers la colonne). */
  onEmptyMemberClick?: () => void;
  onOpenProfile?: () => void;
  policyBadge?: {
    mode: 'off' | 'warn' | 'enforce';
    state: 'idle' | 'compliant' | 'non_compliant';
  };
}

export default function DiscussionHeader({
  selectedTeamProfile, selectedAgentId, selectedProject, selectedRequest,
  setHeaderMenuOpen, headerMenuOpen, copyToClipboard, onEmptyMemberClick, onOpenProfile, policyBadge
}: Props) {
  const badgeClass =
    policyBadge?.state === 'compliant'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
      : policyBadge?.state === 'non_compliant'
        ? 'border-rose-200 bg-rose-50 text-rose-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';

  return (
    <header class="relative flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:px-5">
      <div class="flex min-w-0 flex-1 gap-3">
        {selectedTeamProfile ? (
          <div class="hidden shrink-0 sm:block">
            <TeamAvatar profile={selectedTeamProfile} size="md" class="rounded-2xl shadow-inner ring-1 ring-gray-100" />
          </div>
        ) : (
          <div class="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gray-100 text-sm font-bold text-gray-400 shadow-inner sm:flex">
            ?
          </div>
        )}
        <div class="min-w-0 flex-1">
          {!selectedTeamProfile && onEmptyMemberClick ? (
            <button
              type="button"
              onClick={() => onEmptyMemberClick()}
              class="group w-full min-w-0 rounded-xl px-1 py-0.5 text-left transition hover:bg-gray-50 focus-visible:outline focus-visible:ring-2 focus-visible:ring-[#175B37]/25"
              aria-label="Ouvrir la liste des agents"
            >
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate text-base font-semibold text-[#175B37] underline decoration-[#175B37]/30 underline-offset-2 group-hover:decoration-[#175B37] sm:text-lg">
                  Sélectionnez un membre
                </h2>
              </div>
              <p class="mt-0.5 truncate text-xs text-gray-500 sm:text-sm">
                Touchez ou cliquez pour afficher la liste des agents.
              </p>
            </button>
          ) : (
            <>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="truncate text-base font-semibold text-gray-900 sm:text-lg">
                  {selectedTeamProfile?.displayName ?? 'Sélectionnez un membre'}
                </h2>
                {selectedTeamProfile ? (
                  <span class="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                    {selectedTeamProfile.role}
                  </span>
                ) : null}
              </div>
              <p class="mt-0.5 truncate text-xs text-gray-500 sm:text-sm">
                {selectedTeamProfile
                  ? `Agent ZimaOS · ${selectedTeamProfile.presenceLabel} · modèle ${selectedTeamProfile.modelShort}`
                  : 'Choisissez un membre dans la liste.'}
              </p>
            </>
          )}
          {(selectedProject || selectedRequest) && (
            <div class="mt-2 flex flex-wrap gap-1.5">
              {selectedProject ? (
                <span class="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                  {selectedProject.name}
                </span>
              ) : null}
              {selectedRequest ? (
                <span class="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-600">
                  #{selectedRequest.id} · {truncateText(selectedRequest.title, 28)}
                </span>
              ) : null}
            </div>
          )}
          {policyBadge && policyBadge.mode !== 'off' ? (
            <div class="mt-2">
              <span class={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}>
                Policy strict: {policyBadge.mode} · {policyBadge.state === 'compliant' ? 'conforme' : policyBadge.state === 'non_compliant' ? 'non conforme' : 'en attente'}
              </span>
            </div>
          ) : null}
        </div>
      </div>
      <div class="relative shrink-0 flex items-center gap-2">
        <button
          type="button"
          class="inline-flex h-11 items-center rounded-full border border-gray-200 px-3 text-xs font-semibold text-gray-600 transition hover:bg-gray-50 lg:hidden"
          onClick={() => onOpenProfile?.()}
          disabled={!selectedAgentId}
        >
          Profil
        </button>
        <button
          type="button"
          class="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 text-gray-500 transition hover:bg-gray-50 hover:text-gray-800"
          onClick={() => setHeaderMenuOpen((v: boolean) => !v)}
          aria-label="Options du header"
        >
          <svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 8a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4zm0 6a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        </button>
        {headerMenuOpen && (
          <div class="absolute right-0 top-10 z-20 mt-1 w-52 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
            <button
              class="block w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
              onClick={() => { setHeaderMenuOpen(false); if (selectedAgentId) void copyToClipboard(selectedAgentId); }}
              disabled={!selectedAgentId}
            >
              Copier la clé de session
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
