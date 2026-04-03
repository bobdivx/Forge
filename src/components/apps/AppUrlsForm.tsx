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

export default function AppUrlsForm({ config, forgeVirtualHost, onChange, saving, onSave, message }: Props) {
  const forgeUrl = `http://${forgeVirtualHost}`;

  return (
    <div class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <div class="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-2">
          <h4 class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Hôte Forge (local)</h4>
          <a
            href={forgeUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-blue-400 hover:text-blue-300 font-mono break-all"
          >
            {forgeUrl}
          </a>
          <p class="text-[11px] text-slate-500">Nom DNS interne ZimaOS / reverse proxy.</p>
        </div>
        <FormField
          label="Base URL dev (optionnel)"
          hint="Les URL dev par serveur seront base:port (ex. http://127.0.0.1:4321 si vide)."
        >
          <input
            type="text"
            value={config.devLocalBaseUrl || ''}
            onInput={(e) => onChange({ devLocalBaseUrl: (e.target as HTMLInputElement).value })}
            placeholder="http://localhost"
            class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 outline-none font-mono"
          />
        </FormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <FormField label="URL site de test (staging / preview)">
          <input
            type="url"
            value={config.testUrl || ''}
            onInput={(e) => onChange({ testUrl: (e.target as HTMLInputElement).value })}
            placeholder="https://preview.vercel.app"
            class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 outline-none"
          />
        </FormField>
        <FormField label="URL production">
          <input
            type="url"
            value={config.prodUrl || ''}
            onInput={(e) => onChange({ prodUrl: (e.target as HTMLInputElement).value })}
            placeholder="https://www.example.com"
            class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 outline-none"
          />
        </FormField>
      </div>

      <div class="flex flex-wrap gap-3 items-center">
        {(config.testUrl || '').trim() && (
          <a href={(config.testUrl || '').trim()} target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline border-slate-600 text-slate-200">
            Ouvrir test
          </a>
        )}
        {(config.prodUrl || '').trim() && (
          <a href={(config.prodUrl || '').trim()} target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline border-emerald-500/30 text-emerald-300">
            Ouvrir prod
          </a>
        )}
        <button type="button" onClick={onSave} disabled={saving} class="btn btn-sm bg-blue-600 hover:bg-blue-500 text-white border-0">
          {saving ? 'Enregistrement…' : 'Enregistrer URLs & serveurs'}
        </button>
      </div>

      {message && (
        <div class={`text-xs p-3 rounded-lg border ${message.type === 'ok' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' : 'bg-red-500/10 border-red-500/30 text-red-200'}`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
