import { useState } from 'preact/hooks';

type Props = { appName: string };

const inputCls =
  'w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#175B37]/10 focus:border-[#175B37] transition-colors';

export default function ProjectDemandesForm({ appName }: Props) {
  const [open, setOpen] = useState<'feature' | 'fix' | null>(null);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async (type: 'Fonctionnalite' | 'Correction') => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(appName)}/requests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, detail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.error || 'Erreur');
        setSaving(false);
        return;
      }
      setTitle('');
      setDetail('');
      setOpen(null);
      window.location.reload();
    } catch {
      setMessage('Réseau');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 space-y-5">
      <div>
        <h3 class="text-base font-semibold text-gray-900 flex items-center gap-2">
          <span class="text-lg" aria-hidden>
            📋
          </span>
          Demander une action
        </h3>
        <p class="text-xs text-gray-400 mt-0.5 leading-relaxed">
          Crée une entrée dans la file Astro DB ; les agents Forge peuvent la prendre en charge depuis le carnet de bord.
        </p>
      </div>

      {!open ? (
        <div class="grid grid-cols-1 gap-3">
          <button
            type="button"
            onClick={() => setOpen('feature')}
            class="flex items-center gap-3 rounded-xl border border-[#175B37]/25 bg-[#E9F3EB] px-4 py-3 text-left transition-all hover:border-[#175B37]/40 hover:shadow-sm"
          >
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm border border-[#175B37]/10">
              ✨
            </span>
            <span>
              <span class="block text-sm font-semibold text-gray-900">Nouvelle fonctionnalité</span>
              <span class="block text-[11px] text-gray-500 mt-0.5">Évolution produit, UX, nouveau comportement</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setOpen('fix')}
            class="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-left transition-all hover:border-gray-300 hover:bg-white hover:shadow-sm"
          >
            <span class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-lg shadow-sm border border-gray-100">
              🔧
            </span>
            <span>
              <span class="block text-sm font-semibold text-gray-900">Signaler une correction</span>
              <span class="block text-[11px] text-gray-500 mt-0.5">Bug, régression, dette à traiter</span>
            </span>
          </button>
        </div>
      ) : (
        <div class="space-y-4 rounded-xl border border-gray-100 bg-gray-50/80 p-4">
          <div class="flex items-center justify-between gap-2">
            <span class="text-xs font-semibold uppercase tracking-wide text-gray-500">
              {open === 'feature' ? 'Fonctionnalité' : 'Correction'}
            </span>
            <button
              type="button"
              onClick={() => setOpen(null)}
              class="text-xs font-medium text-gray-400 hover:text-gray-700 transition-colors"
            >
              Annuler
            </button>
          </div>
          <input
            type="text"
            class={inputCls}
            placeholder="Titre court"
            value={title}
            onInput={(e) => setTitle((e.target as HTMLInputElement).value)}
          />
          <textarea
            class={`${inputCls} min-h-[88px] resize-y`}
            placeholder="Détail, contexte, critères d’acceptation (optionnel)"
            value={detail}
            onInput={(e) => setDetail((e.target as HTMLTextAreaElement).value)}
          />
          <button
            type="button"
            disabled={saving || title.trim().length < 2}
            onClick={() => submit(open === 'feature' ? 'Fonctionnalite' : 'Correction')}
            class="w-full rounded-full py-2.5 text-sm font-semibold text-white disabled:opacity-50 transition-all flex items-center justify-center gap-2"
            style="background:#175B37"
          >
            {saving ? (
              <>
                <span class="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Enregistrement…
              </>
            ) : (
              'Enregistrer la demande'
            )}
          </button>
        </div>
      )}

      {message && (
        <div class="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-xs text-red-600">{message}</div>
      )}
    </div>
  );
}
