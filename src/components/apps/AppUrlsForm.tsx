import FormField from '../ui/FormField';

type Config = {
  testUrl?: string;
  prodUrl?: string;
  devLocalBaseUrl?: string;
};

type Props = {
  config: Config;
  forgeVirtualHost: string;
  onChange: (patch: Partial<Config>) => void;
  saving: boolean;
  onSave: () => void;
  message: { type: 'ok' | 'err'; text: string } | null;
};

const inputCls = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition font-mono';

export default function AppUrlsForm({ config, forgeVirtualHost, onChange, saving, onSave, message }: Props) {
  const forgeUrl = `http://${forgeVirtualHost}`;

  return (
    <div class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        {/* Hôte Forge */}
        <div class="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-1.5">
          <p class="text-[10px] font-bold uppercase tracking-widest text-gray-400">Hôte Forge (local)</p>
          <a
            href={forgeUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-blue-500 hover:text-blue-600 hover:underline font-mono break-all block"
          >
            {forgeUrl}
          </a>
          <p class="text-[11px] text-gray-400">Nom DNS interne ZimaOS / reverse proxy.</p>
        </div>

        {/* Base URL dev */}
        <FormField
          label="Base URL dev (optionnel)"
          hint="Préfixe utilisé pour construire les URLs serveurs (ex. http://127.0.0.1)."
        >
          <input
            type="text"
            value={config.devLocalBaseUrl || ''}
            onInput={(e) => onChange({ devLocalBaseUrl: (e.target as HTMLInputElement).value })}
            placeholder="http://localhost"
            class={inputCls}
          />
        </FormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <FormField label="URL de test / staging">
          <input
            type="url"
            value={config.testUrl || ''}
            onInput={(e) => onChange({ testUrl: (e.target as HTMLInputElement).value })}
            placeholder="https://preview.vercel.app"
            class={inputCls}
          />
        </FormField>
        <FormField label="URL production">
          <input
            type="url"
            value={config.prodUrl || ''}
            onInput={(e) => onChange({ prodUrl: (e.target as HTMLInputElement).value })}
            placeholder="https://www.example.com"
            class={inputCls}
          />
        </FormField>
      </div>

      {/* Actions */}
      <div class="flex flex-wrap gap-2 items-center pt-1">
        {(config.testUrl || '').trim() && (
          <a
            href={(config.testUrl || '').trim()}
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs px-4 py-2 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ↗ Ouvrir test
          </a>
        )}
        {(config.prodUrl || '').trim() && (
          <a
            href={(config.prodUrl || '').trim()}
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs px-4 py-2 rounded-full border border-green-200 text-green-700 hover:bg-green-50 transition-colors"
          >
            ↗ Ouvrir prod
          </a>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          class="text-xs px-4 py-2 rounded-full text-white font-medium transition-opacity hover:opacity-90 disabled:opacity-50 ml-auto"
          style="background:#175B37"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer URLs & serveurs'}
        </button>
      </div>

      {message && (
        <div class={`text-xs px-4 py-2.5 rounded-xl border ${
          message.type === 'ok'
            ? 'bg-green-50 border-green-200 text-green-700'
            : 'bg-red-50 border-red-200 text-red-600'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
