import { useState, useEffect } from 'preact/hooks';
import FormField from '../ui/FormField';

type Config = {
  openclawGatewayUrl: string;
  openclawToken: string;
  ollamaUrl: string;
  forgeReposRoot: string;
  dockerYamlDir: string;
  dockerAppDataDir: string;
  githubToken: string;
  vercelToken: string;
  githubWebhookSecret: string;
};

const STEPS = ['OpenClaw', 'Applications & Docker', 'Jetons API', 'Validation'];

const empty: Config = {
  openclawGatewayUrl: 'http://127.0.0.1:24190',
  openclawToken: '',
  ollamaUrl: '',
  forgeReposRoot: '/mnt/GitHub',
  dockerYamlDir: '/DATA/AppData',
  dockerAppDataDir: '/DATA/AppData',
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
  const [healthMsg, setHealthMsg] = useState<string | null>(null);
  const [healthOk, setHealthOk] = useState<boolean | null>(null);

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
          openclawGatewayUrl: String(c.openclawGatewayUrl || empty.openclawGatewayUrl).trim(),
          openclawToken: String(c.openclawToken || ''),
          ollamaUrl: String(c.ollamaUrl || ''),
          forgeReposRoot: String(c.forgeReposRoot || empty.forgeReposRoot),
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

  const merge = (patch: Partial<Config>) => setCfg((p) => ({ ...p, ...patch }));

  const testOpenClaw = async () => {
    setHealthMsg(null);
    setHealthOk(null);
    try {
      const res = await fetch('/api/openclaw-probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openclawGatewayUrl: cfg.openclawGatewayUrl,
          openclawToken: cfg.openclawToken,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.reachable === true) {
        setHealthOk(true);
        setHealthMsg(
          j.sessionCount > 0
            ? `Gateway joignable (${j.sessionCount} session(s) listée(s)).`
            : 'Gateway joignable (liste de sessions vide ou format inattendu).',
        );
      } else {
        setHealthOk(false);
        setHealthMsg(String(j.error || j.message || 'Réponse inattendue'));
      }
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
        <h1 class="text-2xl font-bold text-gray-900 mb-1">Bienvenue sur Forge</h1>
        <p class="text-sm text-gray-500">
          Quelques réglages pour lier OpenClaw, vos dépôts et les jetons optionnels. Vous pourrez tout modifier dans{' '}
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
            <FormField
              label="URL du gateway OpenClaw"
              hint="Ex. http://127.0.0.1:24190 ou l’URL du conteneur sur votre NAS."
            >
              <input
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20"
                value={cfg.openclawGatewayUrl}
                onInput={(e) => merge({ openclawGatewayUrl: (e.target as HTMLInputElement).value })}
              />
            </FormField>
            <FormField label="Jeton OpenClaw" hint="Bearer utilisé par Forge pour invoquer le gateway (peut rester vide en local).">
              <input
                type="password"
                class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm outline-none focus:border-[#175B37] focus:bg-white focus:ring-2 focus:ring-[#175B37]/20 font-mono"
                value={cfg.openclawToken}
                onInput={(e) => merge({ openclawToken: (e.target as HTMLInputElement).value })}
                placeholder="(optionnel)"
                autoComplete="off"
              />
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
                onClick={testOpenClaw}
              >
                Tester la connexion
              </button>
              {healthMsg && (
                <span class={`text-xs ${healthOk ? 'text-green-600' : 'text-amber-700'}`}>{healthMsg}</span>
              )}
            </div>
            <p class="text-[10px] text-gray-400">
              Le test utilise <strong>l’URL et le jeton saisis ci-dessus</strong> (aucune sauvegarde préalable). « Terminer » enregistre ensuite la configuration en base.
            </p>
          </>
        )}

        {step === 1 && (
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
          </>
        )}

        {step === 2 && (
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

        {step === 3 && (
          <div class="space-y-3 text-sm text-gray-600">
            <p class="font-medium text-gray-900">Récapitulatif</p>
            <ul class="space-y-2 font-mono text-xs bg-gray-50 rounded-xl border border-gray-100 p-4">
              <li>
                <span class="text-gray-400">OpenClaw</span> {cfg.openclawGatewayUrl}
              </li>
              <li>
                <span class="text-gray-400">Jeton OC</span> {cfg.openclawToken ? '•••• renseigné' : '(vide)'}
              </li>
              <li>
                <span class="text-gray-400">Applications</span> {cfg.forgeReposRoot}
              </li>
              <li>
                <span class="text-gray-400">YAML / AppData</span> {cfg.dockerYamlDir} · {cfg.dockerAppDataDir}
              </li>
              <li>
                <span class="text-gray-400">GitHub / Vercel / Webhook</span>{' '}
                {[cfg.githubToken, cfg.vercelToken, cfg.githubWebhookSecret].some(Boolean) ? '•••• renseignés' : '(optionnels vides)'}
              </li>
            </ul>
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
