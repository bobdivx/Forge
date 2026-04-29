type AgentPolicySettings = {
  agentGlobalBuildRules: string;
  agentPreferredLanguage: string;
};

type Props = {
  settings: AgentPolicySettings;
  setSettings: (next: AgentPolicySettings) => void;
  onSave: () => void;
  saving: boolean;
  message: string;
};

export default function AgentPolicyTab({ settings, setSettings, onSave, saving, message }: Props) {
  return (
    <div class="p-6 space-y-6">
      <div>
        <h2 class="text-lg font-bold text-gray-900 mb-1">Politique agents</h2>
        <p class="text-xs text-gray-500">
          Règles globales appliquées à l'orchestrateur Forge et aux réponses agents.
        </p>
      </div>

      <div class="rounded-2xl border border-gray-200 bg-gray-50 p-4 space-y-4">
        <div>
          <label class="mb-1 block text-xs font-semibold text-gray-700">Langue préférée chat / rapports</label>
          <select
            value={settings.agentPreferredLanguage || 'fr'}
            onChange={(e) =>
              setSettings({
                ...settings,
                agentPreferredLanguage: (e.target as HTMLSelectElement).value,
              })
            }
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#175B37]"
          >
            <option value="fr">Français</option>
            <option value="en">Anglais</option>
            <option value="fr_en">Français + English</option>
          </select>
        </div>

        <div>
          <label class="mb-1 block text-xs font-semibold text-gray-700">Règles globales build/application</label>
          <textarea
            value={settings.agentGlobalBuildRules || ''}
            onInput={(e) =>
              setSettings({
                ...settings,
                agentGlobalBuildRules: (e.target as HTMLTextAreaElement).value,
              })
            }
            rows={10}
            class="w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 outline-none focus:border-[#175B37]"
            placeholder={
              'Ex: Applications toujours en FR+EN, Astro build, composants Preact, Tailwind CSS, DaisyUI.'
            }
          />
        </div>

        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          class="rounded-full bg-[#175B37] px-4 py-2 text-xs font-bold text-white disabled:opacity-50 hover:bg-[#0f3d25]"
        >
          {saving ? 'Sauvegarde...' : 'Sauvegarder la politique'}
        </button>
      </div>

      {message ? (
        <div class="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700">{message}</div>
      ) : null}
    </div>
  );
}

