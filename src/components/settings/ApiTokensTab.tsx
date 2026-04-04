import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type Config = { githubToken: string; vercelToken: string; [k: string]: string };

export type CustomTokenRow = {
  id?: number;
  key: string;
  label: string;
  secret: string;
  hasSecret?: boolean;
};

type Props = {
  settings: Config;
  setSettings: (c: Config) => void;
  customTokens: CustomTokenRow[];
  setCustomTokens: (rows: CustomTokenRow[]) => void;
  onSave: () => void;
  saving: boolean;
  message: string;
};

export default function ApiTokensTab({
  settings,
  setSettings,
  customTokens,
  setCustomTokens,
  onSave,
  saving,
  message,
}: Props) {
  const addRow = () => {
    setCustomTokens([...customTokens, { key: '', label: '', secret: '', hasSecret: false }]);
  };

  const removeRow = (index: number) => {
    setCustomTokens(customTokens.filter((_, i) => i !== index));
  };

  const updateRow = (index: number, patch: Partial<CustomTokenRow>) => {
    const next = [...customTokens];
    next[index] = { ...next[index], ...patch };
    setCustomTokens(next);
  };

  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-slate-400 mb-4">
          GitHub et Vercel sont lus par les outils Forge. Les jetons personnalisés sont exposés aux{' '}
          <strong class="text-slate-300">agents sur le réseau local</strong> via{' '}
          <code class="text-slate-500">GET /api/agent-api-secrets</code> (réponse JSON :{' '}
          <code class="text-slate-500">custom</code>, plus les jetons GitHub / Vercel / OpenClaw).
        </p>
        <div class="space-y-4">
          <FormField label="GitHub (PAT)">
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              value={settings.githubToken}
              onInput={(e) =>
                setSettings({ ...settings, githubToken: (e.target as HTMLInputElement).value })
              }
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono"
            />
          </FormField>
          <FormField label="Vercel Token">
            <input
              type="password"
              placeholder="xxxxxxxxxxxx"
              value={settings.vercelToken}
              onInput={(e) =>
                setSettings({ ...settings, vercelToken: (e.target as HTMLInputElement).value })
              }
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition font-mono"
            />
          </FormField>
        </div>
      </div>

      <div class="border-t border-slate-800 pt-6">
        <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h3 class="text-sm font-semibold text-white">Jetons personnalisés</h3>
          <button type="button" class="btn btn-sm btn-outline border-slate-600 text-slate-300" onClick={addRow}>
            + Ajouter un jeton
          </button>
        </div>
        <p class="text-[11px] text-slate-500 mb-4">
          <strong class="text-slate-400">Clé</strong> : identifiant stable pour les scripts (ex.{' '}
          <code class="text-slate-600">STRIPE_SECRET</code>), normalisé en MAJUSCULES.{' '}
          <strong class="text-slate-400">Nom</strong> : libellé libre. Laisser le champ secret vide sur une ligne
          existante pour ne pas le modifier.
        </p>
        <div class="space-y-4">
          {customTokens.length === 0 && (
            <p class="text-xs text-slate-600 italic">Aucun jeton personnalisé. Ajoutez-en pour les exposer aux agents.</p>
          )}
          {customTokens.map((row, index) => (
            <div
              key={row.id != null ? `id-${row.id}` : `new-${index}`}
              class="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-3"
            >
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField label="Clé (ex. ANTHROPIC_API_KEY)">
                  <input
                    type="text"
                    placeholder="MA_CLÉ_API"
                    value={row.key}
                    onInput={(e) => updateRow(index, { key: (e.target as HTMLInputElement).value })}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none font-mono"
                  />
                </FormField>
                <FormField label="Nom affiché (optionnel)">
                  <input
                    type="text"
                    placeholder="Anthropic production"
                    value={row.label}
                    onInput={(e) => updateRow(index, { label: (e.target as HTMLInputElement).value })}
                    class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none"
                  />
                </FormField>
              </div>
              <FormField
                label={
                  row.hasSecret
                    ? 'Secret (laisser vide pour garder la valeur actuelle)'
                    : 'Secret'
                }
              >
                <input
                  type="password"
                  placeholder={row.hasSecret ? '•••••••• (inchangé si vide)' : 'coller le jeton'}
                  value={row.secret}
                  onInput={(e) => updateRow(index, { secret: (e.target as HTMLInputElement).value })}
                  class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none font-mono"
                />
              </FormField>
              <div class="flex justify-end">
                <button
                  type="button"
                  class="btn btn-ghost btn-xs text-red-400 hover:bg-red-950/30"
                  onClick={() => removeRow(index)}
                >
                  Retirer
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <SaveRow message={message} saving={saving} onSave={onSave} label="Enregistrer les jetons" />
    </div>
  );
}
