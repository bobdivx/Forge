interface ProfileDraft {
  displayName: string;
  roleTitle: string;
  bio: string;
  avatarUrl: string;
  avatarEmoji: string;
}

interface Props {
  selectedAgentId?: string;
  profileDraft: ProfileDraft;
  setProfileDraft: (d: ProfileDraft | ((prev: ProfileDraft) => ProfileDraft)) => void;
  profileSaving: boolean;
  saveZimaOSProfile: () => Promise<void>;
}

export default function ProfileEditor({
  selectedAgentId, profileDraft, setProfileDraft, profileSaving, saveZimaOSProfile
}: Props) {
  const inputCls = "w-full rounded-2xl border border-gray-200 bg-gray-50/80 px-3.5 py-2.5 text-sm text-gray-900 shadow-inner outline-none transition focus:border-[#175B37] focus:bg-white";

  return (
    <details class="shrink-0 border-t border-gray-100 bg-white px-4 py-3">
      <summary class="cursor-pointer text-xs font-semibold text-gray-800">
        Fiche ZimaOS (persistante)
      </summary>
      {!selectedAgentId ? (
        <p class="mt-3 text-xs text-gray-500">Sélectionnez un membre dans la liste pour éditer sa fiche.</p>
      ) : (
        <div class="mt-3 space-y-2">
          <input
            type="text" class={inputCls} placeholder="Nom" value={profileDraft.displayName}
            onInput={(e) => setProfileDraft(d => ({ ...d, displayName: (e.target as HTMLInputElement).value }))}
          />
          <input
            type="text" class={inputCls} placeholder="Rôle" value={profileDraft.roleTitle}
            onInput={(e) => setProfileDraft(d => ({ ...d, roleTitle: (e.target as HTMLInputElement).value }))}
          />
          <textarea
            class={`${inputCls} min-h-[72px]`} placeholder="Bio..." value={profileDraft.bio}
            onInput={(e) => setProfileDraft(d => ({ ...d, bio: (e.target as HTMLTextAreaElement).value }))}
          />
          <button
            type="button" class="btn btn-success btn-sm mt-2 w-full rounded-xl"
            disabled={profileSaving} onClick={() => void saveZimaOSProfile()}
          >
            {profileSaving ? 'Enregistrement...' : 'Enregistrer la fiche'}
          </button>
        </div>
      )}
    </details>
  );
}
