import { useEffect, useState } from 'preact/hooks';

export default function AgentDoctrineEditor() {
  const [doctrine, setDoctrine] = useState('');
  const [defaultDoctrine, setDefaultDoctrine] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetch('/api/agent-action-doctrine').then((r) => r.json());
      setDoctrine(String(data.doctrine || ''));
      setDefaultDoctrine(String(data.default || ''));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/agent-action-doctrine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctrine }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? 'Doctrine sauvegardée.' : data.error || 'Erreur.');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const reset = async () => {
    if (!confirm('Restaurer la doctrine par défaut ?')) return;
    setSaving(true);
    try {
      const res = await fetch('/api/agent-action-doctrine', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reset: true }),
      });
      const data = await res.json();
      if (res.ok) setDoctrine(String(data.doctrine || ''));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p class="text-xs text-gray-500">Chargement...</p>;

  return (
    <div class="space-y-3">
      <div>
        <h3 class="text-sm font-bold text-gray-900">Doctrine d'action</h3>
        <p class="text-[11px] text-gray-500">
          Texte injecté dans le system prompt de tous les agents. Définit comment ils doivent se comporter (agir vs.
          expliquer, quand utiliser quel outil, etc.).
        </p>
      </div>
      <textarea
        value={doctrine}
        onInput={(e) => setDoctrine((e.target as HTMLTextAreaElement).value)}
        rows={14}
        class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-mono text-gray-900 outline-none focus:border-[#175B37]"
      />
      <div class="flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={reset}
          disabled={saving}
          class="text-xs text-gray-500 hover:text-rose-600"
          title="Restaure le texte d'origine"
        >
          Restaurer la doctrine par défaut
        </button>
        <div class="flex items-center gap-2">
          {message && <span class="text-xs text-emerald-600">{message}</span>}
          <button
            onClick={save}
            disabled={saving || doctrine.trim() === defaultDoctrine.trim()}
            class="rounded-full bg-[#175B37] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
          >
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    </div>
  );
}
