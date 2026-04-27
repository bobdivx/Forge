import { useState, useEffect } from 'preact/hooks';
import FormField from '../ui/FormField';

type Config = {
  forgePublicUrl: string;
  zimaosRuntimeUrl: string;
  forgeApiToken: string;
  ollamaUrl: string;
  forgeReposRoot: string;
  forgeReposRootAgent: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
  githubToken: string;
  vercelToken: string;
  githubWebhookSecret: string;
};

type ValidationResult = {
  ok: boolean;
  checks: Record<string, { ok: boolean; detail: string }>;
};

const STEPS = ['Utilisateur', 'Connexion ZimaOS', 'Montages', 'Clés API', 'Validation'];

const empty: Config = {
  forgePublicUrl: '',
  zimaosRuntimeUrl: '',
  forgeApiToken: '',
  ollamaUrl: '',
  forgeReposRoot: '',
  forgeReposRootAgent: '',
  dockerYamlDir: '',
  dockerAppDataDir: '',
  githubToken: '',
  vercelToken: '',
  githubWebhookSecret: '',
};

export default function SetupWizard() {
  const [step, setStep] = useState(0);
  const [cfg, setCfg] = useState<Config>(empty);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [accountEmail, setAccountEmail] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [accountMsg, setAccountMsg] = useState<string | null>(null);
  const [healthMsg, setHealthMsg] = useState<string | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);

  useEffect(() => {
    fetch('/api/setup-wizard')
      .then((r) => r.json())
      .then((d) => {
        if (d.state && d.state !== 'pending') {
          window.location.href = '/dashboard';
          return;
        }
        const c = d.config || {};
        setCfg({
          forgePublicUrl: String(c.forgePublicUrl || ''),
          zimaosRuntimeUrl: String(c.zimaosRuntimeUrl || c.zimaosGatewayUrl || '').trim(),
          forgeApiToken: String(c.forgeApiToken || ''),
          ollamaUrl: String(c.ollamaUrl || ''),
          forgeReposRoot: String(c.forgeReposRoot || empty.forgeReposRoot),
          forgeReposRootAgent: String(c.forgeReposRootAgent || ''),
          dockerYamlDir: String(c.dockerYamlDir || empty.dockerYamlDir),
          dockerAppDataDir: String(c.dockerAppDataDir || empty.dockerAppDataDir),
          githubToken: String(c.githubToken || ''),
          vercelToken: String(c.vercelToken || ''),
          githubWebhookSecret: String(c.githubWebhookSecret || ''),
        });
      })
      .catch(() => setMsg('Impossible de charger la configuration.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (step !== 1) return;
    if (cfg.forgeReposRoot.trim() && cfg.dockerYamlDir.trim() && cfg.dockerAppDataDir.trim()) return;

    let cancelled = false;
    fetch('/api/setup-wizard')
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const c = d?.config && typeof d.config === 'object' ? d.config : {};
        setCfg((prev) => ({
          ...prev,
          forgeReposRoot: prev.forgeReposRoot || String((c as Record<string, unknown>).forgeReposRoot || ''),
          dockerYamlDir: prev.dockerYamlDir || String((c as Record<string, unknown>).dockerYamlDir || ''),
          dockerAppDataDir: prev.dockerAppDataDir || String((c as Record<string, unknown>).dockerAppDataDir || ''),
        }));
      })
      .catch(() => {
        /* ignore auto-fill errors in wizard */
      });

    return () => {
      cancelled = true;
    };
  }, [step, cfg.forgeReposRoot, cfg.dockerYamlDir, cfg.dockerAppDataDir]);

  const merge = (patch: Partial<Config>) => setCfg((p) => ({ ...p, ...patch }));

  const generateForgeToken = () => {
    const bytes = new Uint8Array(24);
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
      globalThis.crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    merge({ forgeApiToken: `forge_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}` });
  };

  const createUser = async () => {
    setAccountMsg(null);
    if (!accountEmail.trim() || !accountPassword.trim()) {
      setAccountMsg('E-mail et mot de passe requis.');
      return;
    }
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: accountEmail.trim(), password: accountPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setAccountMsg('Utilisateur créé, session active.');
      } else {
        setAccountMsg(String(data.error || 'Échec création utilisateur'));
      }
    } catch {
      setAccountMsg('Erreur réseau.');
    }
  };

  const testZimaosRuntime = async () => {
    setHealthMsg(null);
    setHealthOk(null);
    try {
      const res = await fetch('/api/setup-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'validate',
          ...cfg,
        }),
      });
      const j = await res.json().catch(() => ({}));
      const zimaos = j?.checks?.zimaosRuntime;
      if (res.ok && zimaos?.ok) {
        setHealthOk(true);
        setHealthMsg(String(zimaos.detail || 'Runtime ZimaOS joignable.'));
      } else {
        setHealthOk(false);
        setHealthMsg(String(zimaos?.detail || j.error || j.message || 'Réponse inattendue'));
      }
      setValidation(j as ValidationResult);
    } catch {
      setHealthOk(false);
      setHealthMsg('Erreur réseau.');
    }
  };

  const skip = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/setup-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip' }),
      });
      if (res.ok) window.location.href = '/dashboard';
      else setMsg('Impossible d’enregistrer « plus tard ».');
    } catch {
      setMsg('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  const finish = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/setup-wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'finish', ...cfg }),
      });
      if (res.ok) {
        window.location.href = '/dashboard';
        return;
      }
      const d = await res.json().catch(() => ({}));
      setMsg(String(d.error || 'Échec de la sauvegarde.'));
    } catch {
      setMsg('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-10 text-center text-gray-500 text-sm">
        Chargement de l’assistant…
      </div>
    );
  }

  return (
    <div class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
      <div class="px-6 sm:px-8 pt-8 pb-4 border-b border-gray-100">
        <h1 class="text-2xl font-bold text-gray-900 mb-1">Bienvenue sur ZimaDev</h1>
        <p class="text-sm text-gray-500">
          Assistant de configuration initiale pour ZimaOS, Docker, Ollama et vos clés API. Vous pourrez tout modifier dans{' '}
          <span class="font-medium text-gray-700">Paramètres</span>.
        </p>
        <div class="flex gap-2 mt-6 flex-wrap">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(i)}
              class={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                i === step
                  ? 'text-white border-transparent'
                  : i < step
                    ? 'bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300'
                    : 'bg-white text-gray-400 border-gray-100'
              }`}
              style={i === step ? { background: '#175B37' } : undefined}
            >
              {i + 1}. {label}
            </button>
          ))}
        </div>
      </div>

      <div class="px-6 sm:px-8 py-8 space-y-5">
        {step === 0 && (
          <>
            <FormField label="Création utilisateur (optionnel)" hint="Créer un compte local dès l’assistant si nécessaire.">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="email"
                  class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                  value={accountEmail}
                  onInput={(e) => setAccountEmail((e.target as HTMLInputElement).value)}
                  placeholder="admin@zima.dev"
                  autoComplete="email"
                />
                <input
                  type="password"
                  class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                  value={accountPassword}
                  onInput={(e) => setAccountPassword((e.target as HTMLInputElement).value)}
                  placeholder="Mot de passe fort"
                  autoComplete="new-password"
                />
              </div>
              <div class="mt-3 flex items-center gap-3">
                <button
                  type="button"
                  class="text-sm font-medium px-4 py-2 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
                  onClick={createUser}
                >
                  Créer l’utilisateur
                </button>
                {accountMsg && <span class="text-xs text-gray-600">{accountMsg}</span>}
              </div>
            </FormField>
          </>
        )}

        {step === 1 && (
          <>
            <FormField
              label="URL Forge joignable par les agents"
              hint="Ex. production Docker: http://forge-host:4331. Dev hôte: http://forge-host:4321. Si vide, Forge l'infère automatiquement."
            >
              <input
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                value={cfg.forgePublicUrl}
                onInput={(e) => merge({ forgePublicUrl: (e.target as HTMLInputElement).value })}
              />
            </FormField>
            <FormField
              label="URL runtime ZimaOS (préremplie)"
              hint="Détection auto: Docker -> host.docker.internal puis fallback sur l’hôte courant."
            >
              <input
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                value={cfg.zimaosRuntimeUrl}
                onInput={(e) => merge({ zimaosRuntimeUrl: (e.target as HTMLInputElement).value })}
              />
            </FormField>
            <FormField label="Jeton API Forge (agents -> Forge)">
              <div class="space-y-2">
                <input
                  type="password"
                  class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20 font-mono"
                  value={cfg.forgeApiToken}
                  onInput={(e) => merge({ forgeApiToken: (e.target as HTMLInputElement).value })}
                  placeholder="forge_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                  autoComplete="off"
                />
                <button
                  type="button"
                  class="text-xs font-medium px-3 py-1.5 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
                  onClick={generateForgeToken}
                >
                  Générer un jeton Forge
                </button>
              </div>
            </FormField>
            <FormField
              label="URL Ollama (optionnel)"
              hint="Pour la matrice « Modèles agents » : liste des tags Ollama. Ex. http://host.docker.internal:11434 sur Docker."
            >
              <input
                type="url"
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                value={cfg.ollamaUrl}
                onInput={(e) => merge({ ollamaUrl: (e.target as HTMLInputElement).value })}
                placeholder="http://host.docker.internal:11434"
              />
            </FormField>
            <div class="flex flex-wrap items-center gap-3">
              <button
                type="button"
                class="text-sm font-medium px-4 py-2 rounded-full border border-gray-200 hover:bg-gray-50 transition-colors"
                onClick={testZimaosRuntime}
              >
                Tester runtime ZimaOS + Ollama
              </button>
              {healthMsg && (
                <span class={`text-xs ${healthOk ? 'text-green-600' : 'text-amber-700'}`}>{healthMsg}</span>
              )}
            </div>
            <p class="text-[10px] text-gray-400">
              Le test vérifie la communication Forge {'->'} runtime ZimaOS et Forge {'->'} Ollama avec les valeurs saisies.
            </p>
          </>
        )}

        {step === 2 && (
          <>
            <FormField
              label="Répertoire des applications"
              hint="Dossier parent : un sous-dossier = une application (clone Git). Ex. /media/GitHub."
            >
              <input
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                value={cfg.forgeReposRoot}
                onInput={(e) => merge({ forgeReposRoot: (e.target as HTMLInputElement).value })}
              />
            </FormField>
            <FormField label="Répertoire YAML Docker" hint="Où Forge lit les stacks (compose).">
              <input
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                value={cfg.dockerYamlDir}
                onInput={(e) => merge({ dockerYamlDir: (e.target as HTMLInputElement).value })}
              />
            </FormField>
            <FormField label="AppData Docker" hint="Données persistantes des conteneurs.">
              <input
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                value={cfg.dockerAppDataDir}
                onInput={(e) => merge({ dockerAppDataDir: (e.target as HTMLInputElement).value })}
              />
            </FormField>
            <FormField label="Racine des projets vue par les agents (NAS)">
              <input
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                value={cfg.forgeReposRootAgent}
                onInput={(e) => merge({ forgeReposRootAgent: (e.target as HTMLInputElement).value })}
              />
            </FormField>
          </>
        )}

        {step === 3 && (
          <>
            <FormField label="GitHub token" hint="Pour les intégrations API GitHub (optionnel).">
              <input
                type="password"
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                value={cfg.githubToken}
                onInput={(e) => merge({ githubToken: (e.target as HTMLInputElement).value })}
                placeholder="(optionnel)"
                autoComplete="off"
              />
            </FormField>
            <FormField label="Vercel token" hint="Optionnel.">
              <input
                type="password"
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                value={cfg.vercelToken}
                onInput={(e) => merge({ vercelToken: (e.target as HTMLInputElement).value })}
                placeholder="(optionnel)"
                autoComplete="off"
              />
            </FormField>
            <FormField label="Secret webhook GitHub (PR Jules)" hint="Optionnel ; même valeur que sur GitHub.">
              <input
                type="password"
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-mono outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                value={cfg.githubWebhookSecret}
                onInput={(e) => merge({ githubWebhookSecret: (e.target as HTMLInputElement).value })}
                placeholder="(optionnel)"
                autoComplete="off"
              />
            </FormField>
          </>
        )}

        {step === 4 && (
          <div class="space-y-3 text-sm text-gray-600">
            <p class="font-medium text-gray-900">Récapitulatif</p>
            <ul class="space-y-2 font-mono text-xs bg-gray-50 rounded-xl border border-gray-100 p-4">
              <li>
                <span class="text-gray-400">Forge URL</span> {cfg.forgePublicUrl || '(auto)'}
              </li>
              <li>
                <span class="text-gray-400">Jeton Forge API</span> {cfg.forgeApiToken ? '•••• renseigné' : '(auto-généré si vide)'}
              </li>
              <li>
                <span class="text-gray-400">Runtime ZimaOS</span> {cfg.zimaosRuntimeUrl}
              </li>
              <li>
                <span class="text-gray-400">Applications</span> {cfg.forgeReposRoot}
              </li>
              <li>
                <span class="text-gray-400">Racine agents NAS</span> {cfg.forgeReposRootAgent || '(vide)'}
              </li>
              <li>
                <span class="text-gray-400">YAML / AppData</span> {cfg.dockerYamlDir} · {cfg.dockerAppDataDir}
              </li>
              <li>
                <span class="text-gray-400">GitHub / Vercel / Webhook</span>{' '}
                {[cfg.githubToken, cfg.vercelToken, cfg.githubWebhookSecret].some(Boolean) ? '•••• renseignés' : '(optionnels vides)'}
              </li>
            </ul>
            {validation?.checks ? (
              <ul class="space-y-2 text-xs rounded-xl border border-gray-200 bg-white p-4">
                {Object.entries(validation.checks).map(([key, value]) => (
                  <li key={key} class={value.ok ? 'text-green-700' : 'text-amber-700'}>
                    <span class="font-semibold">{key}</span> - {value.detail}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {msg && (
          <p class="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {msg}
          </p>
        )}
      </div>

      <div class="px-6 sm:px-8 py-5 bg-gray-50/80 border-t border-gray-100 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
        <button
          type="button"
          class="text-sm text-gray-500 hover:text-gray-800 underline-offset-2 hover:underline"
          onClick={skip}
          disabled={saving}
        >
          Plus tard (configurer dans Paramètres)
        </button>
        <div class="flex flex-wrap gap-2 justify-end">
          {step > 0 && (
            <button
              type="button"
              class="text-sm font-medium px-4 py-2 rounded-full border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={saving}
            >
              Précédent
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              class="text-sm font-semibold px-5 py-2 rounded-full text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: '#175B37' }}
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={saving}
            >
              Suivant
            </button>
          ) : (
            <button
              type="button"
              class="text-sm font-semibold px-5 py-2 rounded-full text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{ background: '#175B37' }}
              onClick={finish}
              disabled={saving}
            >
              {saving ? 'Enregistrement…' : 'Terminer et ouvrir le tableau de bord'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
