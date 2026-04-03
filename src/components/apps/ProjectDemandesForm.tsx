import { useState } from 'preact/hooks';

type Props = { appName: string };

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
      if (!res.ok) { setMessage(data.error || 'Erreur'); setSaving(false); return; }
      setTitle(''); setDetail(''); setOpen(null);
      window.location.reload();
    } catch {
      setMessage('Réseau');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section class="bg-slate-900 border border-slate-800 rounded-xl p-6">
      <h3 class="text-sm font-bold uppercase tracking-widest text-slate-500 mb-2">Demander une action</h3>
      <p class="text-[11px] text-slate-600 mb-4">
        Les demandes sont centralisées dans la base de données de la Forge (Astro DB).
      </p>
      {!open ? (
        <div class="space-y-3">
          <button type="button" class="btn btn-sm w-full bg-blue-600 hover:bg-blue-500 border-none text-white" onClick={() => setOpen('feature')}>
            Nouvelle fonctionnalité
          </button>
          <button type="button" class="btn btn-sm w-full btn-outline border-slate-700 text-slate-200 hover:bg-slate-800" onClick={() => setOpen('fix')}>
            Signaler une correction
          </button>
        </div>
      ) : (
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-xs text-slate-400">{open === 'feature' ? 'Fonctionnalité' : 'Correction'}</span>
            <button type="button" class="btn btn-ghost btn-xs" onClick={() => setOpen(null)}>Fermer</button>
          </div>
          <input type="text" class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white" placeholder="Titre court" value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} />
          <textarea class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white min-h-[72px]" placeholder="Détail (optionnel)" value={detail} onInput={(e) => setDetail((e.target as HTMLTextAreaElement).value)} />
          <button type="button" class={`btn btn-sm w-full btn-primary ${saving ? 'loading' : ''}`} disabled={saving || title.trim().length < 2} onClick={() => submit(open === 'feature' ? 'Fonctionnalite' : 'Correction')}>
            Enregistrer
          </button>
        </div>
      )}
      {message && <p class="text-xs mt-3 text-rose-400">{message}</p>}
    </section>
  );
}
