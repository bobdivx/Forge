import { useEffect, useState } from 'preact/hooks';
import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type GeminiSettings = {
  geminiApiKey: string;
  geminiBaseUrl: string;
  geminiEnabled: boolean;
};

type GeminiModelEntry = { id: string; label: string };

type GeminiModelsResponse = {
  ok: boolean;
  configured: boolean;
  enabled: boolean;
  status?: number;
  models?: GeminiModelEntry[];
  error?: string;
};

type GeminiTestResponse = {
  ok: boolean;
  status: number;
  latencyMs: number;
  preview?: string;
  error?: string;
  model?: string;
};

const inputCls =
  'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition';
const monoInputCls = `${inputCls} font-mono`;

export default function GeminiTab() {
  const [settings, setSettings] = useState<GeminiSettings>({
    geminiApiKey: '',
    geminiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    geminiEnabled: false,
  });
  const [hasStoredKey, setHasStoredKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [models, setModels] = useState<GeminiModelEntry[]>([]);
  const [modelsState, setModelsState] = useState<{
    loaded: boolean;
    ok: boolean;
    error?: string;
  }>({ loaded: false, ok: false });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<GeminiTestResponse | null>(null);
  const [testModel, setTestModel] = useState('');

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      const apiKey = String(data.geminiApiKey || '');
      setHasStoredKey(apiKey.length > 0);
      setSettings({
        geminiApiKey: apiKey,
        geminiBaseUrl:
          String(data.geminiBaseUrl || '').trim() ||
          'https://generativelanguage.googleapis.com/v1beta/openai',
        geminiEnabled: String(data.geminiEnabled || '').toLowerCase() === 'true',
      });
    } catch {
      setMessage('Erreur lors du chargement.');
    } finally {
      setLoading(false);
    }
  };

  const loadModels = async (force = false) => {
    try {
      const url = force ? '/api/gemini-models?force=1' : '/api/gemini-models';
      const res = await fetch(url);
      const data = (await res.json()) as GeminiModelsResponse;
      const list = Array.isArray(data.models) ? data.models : [];
      setModels(list);
      setModelsState({ loaded: true, ok: !!data.ok, error: data.error });
      if (list.length > 0 && !list.find((m) => m.id === testModel)) {
        setTestModel(list[0].id);
      }
    } catch (e) {
      setModelsState({ loaded: true, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  useEffect(() => {
    loadSettings();
    loadModels();
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          geminiApiKey: settings.geminiApiKey,
          geminiBaseUrl: settings.geminiBaseUrl,
          geminiEnabled: settings.geminiEnabled ? 'true' : 'false',
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(typeof payload.error === 'string' ? payload.error : 'Erreur lors de la sauvegarde.');
        return;
      }
      setMessage('Configuration Gemini enregistrée.');
      await loadSettings();
      await loadModels(true);
    } catch {
      setMessage('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/gemini-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: testModel,
          // Si l'utilisateur a saisi une clé non sauvegardée, l'envoyer pour tester sans persister.
          apiKey: settings.geminiApiKey || undefined,
          baseUrl: settings.geminiBaseUrl || undefined,
        }),
      });
      const data = (await res.json()) as GeminiTestResponse;
      setTestResult(data);
    } catch (e) {
      setTestResult({
        ok: false,
        status: 0,
        latencyMs: 0,
        error: e instanceof Error ? e.message : 'Erreur réseau.',
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) return <div class="p-6 text-sm text-gray-400 animate-pulse">Chargement…</div>;

  return (
    <div class="p-6 space-y-6">
      <div>
        <h2 class="text-lg font-bold text-gray-900 mb-1">Provider Gemini (Google AI)</h2>
        <p class="text-xs text-gray-500 max-w-2xl">
          Forge sait dialoguer avec les modèles Google Gemini via l'endpoint
          OpenAI-compatible (<code class="text-gray-500">/v1beta/openai</code>). Configurez votre
          clé{' '}
          <a
            href="https://aistudio.google.com/app/apikey"
            target="_blank"
            rel="noreferrer"
            class="text-[#175B37] underline hover:opacity-80"
          >
            AI Studio
          </a>
          {' '}puis activez Gemini pour qu'il apparaisse dans la matrice modèles agents.
        </p>
      </div>

      <div class="space-y-4">
        <FormField
          label="Clé API Google AI (Gemini)"
          hint={
            hasStoredKey
              ? 'Une clé est déjà enregistrée. Laissez vide pour ne pas l’écraser.'
              : 'Stockée dans la table Config. Visible uniquement par le dashboard authentifié.'
          }
        >
          <input
            type="password"
            placeholder={hasStoredKey ? '•••••••• (inchangé si vide)' : 'AIza...'}
            value={settings.geminiApiKey}
            onInput={(e) =>
              setSettings({ ...settings, geminiApiKey: (e.target as HTMLInputElement).value })
            }
            class={monoInputCls}
          />
        </FormField>

        <FormField
          label="URL de base (OpenAI-compatible)"
          hint="Pour usage standard, conservez l'URL par défaut Google AI."
        >
          <input
            type="url"
            value={settings.geminiBaseUrl}
            onInput={(e) =>
              setSettings({ ...settings, geminiBaseUrl: (e.target as HTMLInputElement).value })
            }
            class={monoInputCls}
            placeholder="https://generativelanguage.googleapis.com/v1beta/openai"
          />
        </FormField>

        <label class="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.geminiEnabled}
            onChange={(e) =>
              setSettings({ ...settings, geminiEnabled: (e.target as HTMLInputElement).checked })
            }
            class="w-4 h-4 accent-[#175B37]"
          />
          <div>
            <p class="text-sm font-semibold text-gray-900">Exposer Gemini aux agents</p>
            <p class="text-[11px] text-gray-500">
              Une fois activé, les modèles Gemini apparaissent dans la matrice de modèles et
              l'orchestrateur Forge route automatiquement les appels.
            </p>
          </div>
        </label>
      </div>

      <div class="border-t border-gray-200 pt-6 space-y-3">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 class="text-sm font-bold text-gray-900">Modèles détectés</h3>
            <p class="text-[11px] text-gray-500">
              Liste rafraîchie via <code class="text-gray-500">GET /v1beta/openai/models</code>.
            </p>
          </div>
          <button
            type="button"
            onClick={() => loadModels(true)}
            class="text-[11px] border border-gray-300 text-gray-700 px-3 py-1.5 rounded-full hover:bg-gray-50"
          >
            Rafraîchir
          </button>
        </div>
        {!modelsState.loaded && <p class="text-xs text-gray-400 italic">Chargement…</p>}
        {modelsState.loaded && !modelsState.ok && (
          <p class="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-3">
            {modelsState.error || 'Aucun modèle accessible. Vérifiez la clé API et réessayez.'}
          </p>
        )}
        {modelsState.loaded && modelsState.ok && models.length === 0 && (
          <p class="text-xs text-gray-500 italic bg-gray-50 border border-gray-200 rounded-lg p-3">
            L’API Gemini n’a renvoyé aucun modèle pour cette clé.
          </p>
        )}
        {modelsState.loaded && models.length > 0 && (
          <div class="flex flex-wrap gap-2">
            {models.map((m) => (
              <span
                key={m.id}
                class="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[11px] font-mono"
              >
                {m.id}
              </span>
            ))}
          </div>
        )}
      </div>

      <div class="border-t border-gray-200 pt-6 space-y-3">
        <h3 class="text-sm font-bold text-gray-900">Test de connexion</h3>
        <div class="flex gap-3 flex-wrap items-end">
          <FormField label="Modèle à tester" className="flex-1 min-w-[220px]">
            <select
              value={testModel}
              onChange={(e) => setTestModel((e.target as HTMLSelectElement).value)}
              class={inputCls}
              disabled={models.length === 0}
            >
              {models.length === 0 && (
                <option value="">— Aucun modèle découvert —</option>
              )}
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id}
                </option>
              ))}
            </select>
          </FormField>
          <button
            type="button"
            onClick={runTest}
            disabled={
              testing ||
              (!settings.geminiApiKey && !hasStoredKey) ||
              models.length === 0
            }
            class="px-4 py-2 rounded-full bg-gray-900 text-white text-xs font-bold hover:bg-black disabled:opacity-50"
          >
            {testing ? 'Test…' : 'Lancer un PING'}
          </button>
        </div>
        {testResult && (
          <div
            class={`rounded-lg border p-3 text-xs ${testResult.ok ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}
          >
            <p class="font-semibold">
              {testResult.ok ? 'Réponse OK' : 'Échec'} — {testResult.status} ·{' '}
              {testResult.latencyMs} ms
            </p>
            {testResult.preview && (
              <pre class="mt-1 whitespace-pre-wrap font-mono text-[11px]">{testResult.preview}</pre>
            )}
            {testResult.error && <p class="mt-1 font-mono text-[11px]">{testResult.error}</p>}
          </div>
        )}
      </div>

      <SaveRow message={message} saving={saving} onSave={save} label="Enregistrer Gemini" />
    </div>
  );
}
