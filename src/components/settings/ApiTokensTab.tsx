import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type Config = { githubToken: string; vercelToken: string; forgeApiToken: string; [k: string]: string };

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

const inputCls = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition';
const monoInputCls = `${inputCls} font-mono`;

export default function ApiTokensTab({
  settings,
  setSettings,
  customTokens,
  setCustomTokens,
  onSave,
  saving,
  message,
}: Props) {
  const generateForgeApiToken = () => {
    const bytes = new Uint8Array(24);
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    const token = `forge_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    setSettings({ ...settings, forgeApiToken: token });
  };

  const copyForgeApiToken = async () => {
    const token = String(settings.forgeApiToken || '').trim();
    if (!token || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      /* no-op */
    }
  };

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
        <p class="text-xs text-gray-500 mb-4">
          Les champs GitHub et Vercel alimentent la réponse JSON{' '}
          <code class="text-gray-500">githubToken</code> et{' '}
          <code class="text-gray-500">vercelToken</code>. Chaque ligne des jetons personnalisés devient une entrée dans{' '}
          <code class="text-gray-500">custom</code> (clé normalisée en MAJUSCULES, ex.{' '}
          <code class="text-gray-500">ma_cle</code> → <code class="text-gray-500">MA_CLE</code>). Les agents sur le réseau
          local récupèrent le tout via{' '}
          <code class="text-gray-500">GET /api/agent-api-secrets</code> (y compris ZimaOS, voir la doc agents /
          FORGE_API_CONTRACT).
        </p>
        <div class="space-y-4">
          <FormField
            label="Jeton API Forge (agents)"
            hint="Utilisé par ZimaOS/agents pour appeler les endpoints Forge depuis une machine distante. Header accepté : Authorization: Bearer <token>."
          >
            <div class="space-y-2">
              <input
                type="password"
                placeholder="forge_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                value={settings.forgeApiToken}
                onInput={(e) =>
                  setSettings({ ...settings, forgeApiToken: (e.target as HTMLInputElement).value })
                }
                class={monoInputCls}
              />
              <div class="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  class="border border-gray-300 text-gray-700 text-xs px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors"
                  onClick={generateForgeApiToken}
                >
                  Générer un jeton Forge
                </button>
                <button
                  type="button"
                  class="border border-gray-200 text-gray-600 text-xs px-3 py-1.5 rounded-full hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  onClick={copyForgeApiToken}
                  disabled={!settings.forgeApiToken}
                >
                  Copier
                </button>
              </div>
            </div>
          </FormField>
          <FormField label="Cloudflare (API Token Tunnel)">
            <input
              type="password"
              placeholder="Clé API (Zone/Tunnel)..."
              value={settings.cloudflareToken || ''}
              onInput={(e) =>
                setSettings({ ...settings, cloudflareToken: (e.target as HTMLInputElement).value })
              }
              class={monoInputCls}
            />
            <div class="mt-2 text-xs text-gray-500 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
              <p class="font-semibold text-blue-800 mb-1">Pour générer ce jeton, autorisations requises sur votre compte Cloudflare :</p>
              <ul class="list-disc pl-4 space-y-0.5 text-blue-700/80">
                <li>Zone : DNS (Édition)</li>
                <li>Compte : Cloudflare Tunnel (Édition)</li>
                <li>Compte : Account Settings (Lecture)</li>
              </ul>
              <p class="mt-2 text-[10px] text-gray-400">Ne donnez pas d'accès global "Éditer toutes les ressources". Limitez l'accès à la zone DNS que vous souhaitez utiliser (ex: briseteia.me).</p>
            </div>
          </FormField>
          <FormField label="GitHub (PAT)">
            <input
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              value={settings.githubToken}
              onInput={(e) =>
                setSettings({ ...settings, githubToken: (e.target as HTMLInputElement).value })
              }
              class={monoInputCls}
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
              class={monoInputCls}
            />
          </FormField>
          <FormField label="Secret webhook GitHub (PR Jules)">
            <input
              type="password"
              placeholder="identique au secret du webhook sur GitHub.com"
              value={settings.githubWebhookSecret}
              onInput={(e) =>
                setSettings({
                  ...settings,
                  githubWebhookSecret: (e.target as HTMLInputElement).value,
                })
              }
              class={monoInputCls}
            />
            <p class="text-[11px] text-gray-400 mt-1">
              Vérification HMAC des POST vers{' '}
              <code class="text-gray-500">/api/webhooks/github-jules</code>. Stocké en base (Config). En secours :{' '}
              <code class="text-gray-500">GITHUB_WEBHOOK_SECRET</code>. Si tu enregistres un autre onglet (ZimaOS,
              Infra) sans retaper ce champ, la valeur en base est conservée.
            </p>
          </FormField>
        </div>
      </div>

      <div class="border-t border-gray-200 pt-6">
        <div class="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h3 class="text-sm font-semibold text-gray-900">Jetons personnalisés</h3>
          <button
            type="button"
            class="border border-gray-300 text-gray-600 text-sm px-4 py-1.5 rounded-full hover:bg-gray-50 transition-colors"
            onClick={addRow}
          >
            + Ajouter un jeton
          </button>
        </div>
        <p class="text-[11px] text-gray-400 mb-4">
          <strong class="text-gray-500">Clé</strong> : identifiant stable pour les scripts (ex.{' '}
          <code class="text-gray-500">STRIPE_SECRET</code>), normalisé en MAJUSCULES.{' '}
          <strong class="text-gray-500">Nom</strong> : libellé libre. Laisser le champ secret vide sur une ligne existante pour ne pas le modifier.
        </p>
        <div class="space-y-4">
          {customTokens.length === 0 && (
            <p class="text-xs text-gray-400 italic">Aucun jeton personnalisé. Ajoutez-en pour les exposer aux agents.</p>
          )}
          {customTokens.map((row, index) => (
            <div
              key={row.id != null ? `id-${row.id}` : `new-${index}`}
              class="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3"
            >
              <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FormField label="Clé (ex. ANTHROPIC_API_KEY)">
                  <input
                    type="text"
                    placeholder="MA_CLÉ_API"
                    value={row.key}
                    onInput={(e) => updateRow(index, { key: (e.target as HTMLInputElement).value })}
                    class={monoInputCls}
                  />
                </FormField>
                <FormField label="Nom affiché (optionnel)">
                  <input
                    type="text"
                    placeholder="Anthropic production"
                    value={row.label}
                    onInput={(e) => updateRow(index, { label: (e.target as HTMLInputElement).value })}
                    class={inputCls}
                  />
                </FormField>
              </div>
              <FormField
                label={row.hasSecret ? 'Secret (laisser vide pour garder la valeur actuelle)' : 'Secret'}
              >
                <input
                  type="password"
                  placeholder={row.hasSecret ? '•••••••• (inchangé si vide)' : 'coller le jeton'}
                  value={row.secret}
                  onInput={(e) => updateRow(index, { secret: (e.target as HTMLInputElement).value })}
                  class={monoInputCls}
                />
              </FormField>
              <div class="flex justify-end">
                <button
                  type="button"
                  class="text-xs text-red-500 hover:text-red-600 hover:underline transition-colors"
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
