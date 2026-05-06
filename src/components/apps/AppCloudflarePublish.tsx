import { useMemo, useState } from 'preact/hooks';

/** Aligné sur la zone utilisée par POST /api/cloudflare-tunnel (simulation). */
const PUBLISH_ZONE = 'briseteia.me';

function slugifySubdomain(raw: string): string {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
  return s;
}

function isValidDnsLabel(label: string): boolean {
  if (label.length < 1 || label.length > 63) return false;
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label);
}

type Props = {
  appFolderKey: string;
};

export default function AppCloudflarePublish({ appFolderKey }: Props) {
  const defaultSub = useMemo(() => slugifySubdomain(appFolderKey) || 'app', [appFolderKey]);
  const [subdomain, setSubdomain] = useState(defaultSub);
  const [busy, setBusy] = useState(false);
  const [lastUrl, setLastUrl] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const previewLabel = slugifySubdomain(subdomain) || '…';
  const previewValid = isValidDnsLabel(previewLabel);
  const previewUrl = previewValid ? `https://${previewLabel}.${PUBLISH_ZONE}` : null;

  const publish = async () => {
    const label = slugifySubdomain(subdomain);
    if (!isValidDnsLabel(label)) {
      setFeedback({
        type: 'err',
        text: 'Sous-domaine invalide : utilisez des lettres minuscules, chiffres et tirets (63 caractères max, sans tiret en début/fin).',
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/cloudflare-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName: appFolderKey,
          subdomain: label,
          action: 'publish',
        }),
      });
      const data = (await res.json()) as { error?: string; url?: string; message?: string };
      if (!res.ok || data.error) {
        setFeedback({ type: 'err', text: data.error || 'La publication a été refusée.' });
        return;
      }
      const url = typeof data.url === 'string' ? data.url : previewUrl;
      if (url) setLastUrl(url);
      setFeedback({
        type: 'ok',
        text: data.message ? String(data.message) : 'Demande enregistrée. Vérifiez la configuration du tunnel sur votre NAS.',
      });
    } catch {
      setFeedback({ type: 'err', text: 'Erreur réseau.' });
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    const label = slugifySubdomain(subdomain);
    if (!isValidDnsLabel(label)) {
      setFeedback({
        type: 'err',
        text: 'Indiquez le même sous-domaine que celui publié pour retirer la route.',
      });
      return;
    }
    setBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/cloudflare-tunnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appName: appFolderKey,
          subdomain: label,
          action: 'unpublish',
        }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (!res.ok || data.error) {
        setFeedback({ type: 'err', text: data.error || 'Impossible de retirer la route.' });
        return;
      }
      setLastUrl(null);
      setFeedback({
        type: 'ok',
        text: data.message ? String(data.message) : 'Route retirée (simulation API).',
      });
    } catch {
      setFeedback({ type: 'err', text: 'Erreur réseau.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="rounded-[1.25rem] border border-orange-100 bg-gradient-to-br from-orange-50/80 to-white p-5 shadow-sm">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-orange-700/90">Publication</p>
          <h2 class="mt-1 text-base font-bold text-gray-900">Exposer le dev en HTTPS via Cloudflare</h2>
          <p class="mt-2 text-sm text-gray-600 leading-relaxed max-w-2xl">
            Forge envoie une demande côté serveur en utilisant votre jeton Cloudflare (Paramètres → Jetons API).
            En production, cela crée généralement une entrée DNS et une règle d’ingress <span class="font-semibold">Cloudflare Tunnel</span>{' '}
            (<code class="text-xs bg-white/80 px-1 py-0.5 rounded border border-orange-100">cloudflared</code>) pointant vers votre instance locale
            (ex. <span class="font-mono text-xs">zimacube.local:port</span>).
          </p>
        </div>
      </div>

      <div class="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <label for={`cf-sub-${appFolderKey}`} class="block text-xs font-semibold text-gray-700 mb-1.5">
            Sous-domaine public
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <input
              id={`cf-sub-${appFolderKey}`}
              type="text"
              value={subdomain}
              onInput={(e) => setSubdomain((e.target as HTMLInputElement).value)}
              autocomplete="off"
              spellcheck={false}
              class="min-w-[12rem] flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-mono shadow-inner focus:border-[#175B37] focus:outline-none focus:ring-2 focus:ring-[#175B37]/20"
              placeholder="ex. compta-demo"
            />
            <span class="text-sm text-gray-500 font-mono">
              .{PUBLISH_ZONE}
            </span>
          </div>
          <p class="mt-1.5 text-[11px] text-gray-500">
            URL prévue :{' '}
            {previewUrl ? (
              <a href={previewUrl} class="font-mono text-[#175B37] underline decoration-[#175B37]/30 hover:decoration-[#175B37]" target="_blank" rel="noopener noreferrer">
                {previewUrl}
              </a>
            ) : (
              <span class="font-mono text-gray-400">—</span>
            )}
          </p>
        </div>
        <div class="flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            disabled={busy || !previewValid}
            onClick={() => void unpublish()}
            class="rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Retirer
          </button>
          <button
            type="button"
            disabled={busy || !previewValid}
            onClick={() => void publish()}
            class="rounded-xl border-2 border-[#175B37] bg-[#175B37] px-4 py-2 text-sm font-semibold text-white hover:bg-[#134d2e] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Envoi…' : 'Publier via Cloudflare'}
          </button>
        </div>
      </div>

      {lastUrl && (
        <p class="mt-3 text-xs text-gray-600">
          Dernière URL signalée :{' '}
          <a class="font-mono text-[#175B37] underline" href={lastUrl} target="_blank" rel="noopener noreferrer">
            {lastUrl}
          </a>
        </p>
      )}

      {feedback && (
        <p
          class={`mt-3 text-sm rounded-lg px-3 py-2 ${
            feedback.type === 'ok' ? 'bg-emerald-50 text-emerald-900 border border-emerald-100' : 'bg-red-50 text-red-800 border border-red-100'
          }`}
        >
          {feedback.text}
        </p>
      )}

      <p class="mt-3 text-[10px] text-gray-400 leading-snug">
        Astuce : choisissez un sous-domaine stable par environnement (ex. prévisualisation client). La route réelle dépend de votre compte Cloudflare,
        de la zone DNS <span class="font-mono">{PUBLISH_ZONE}</span> et d’un tunnel déjà autorisé sur cette machine.
      </p>
    </div>
  );
}
