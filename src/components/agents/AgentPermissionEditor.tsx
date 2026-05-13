import { useEffect, useState } from 'preact/hooks';

type PermissionMode = 'autonomous' | 'tiered' | 'plan_first';

type Config = {
  agentId: string;
  mode: PermissionMode | null;
  allowedTools: string[];
  deniedTools: string[];
};

const MODES: Array<{ value: PermissionMode | ''; label: string }> = [
  { value: '', label: 'Hériter du mode global' },
  { value: 'autonomous', label: 'Autonomie totale' },
  { value: 'tiered', label: 'Approbation graduée' },
  { value: 'plan_first', label: 'Plan d\'abord (chaque action)' },
];

function csvToList(raw: string): string[] {
  return raw
    .split(/[\n,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function AgentPermissionEditor({ agentId }: { agentId: string }) {
  const [config, setConfig] = useState<Config>({
    agentId,
    mode: null,
    allowedTools: [],
    deniedTools: [],
  });
  const [allowedRaw, setAllowedRaw] = useState('');
  const [deniedRaw, setDeniedRaw] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = () => {
    setLoading(true);
    fetch(`/api/permissions/agent/${encodeURIComponent(agentId)}`)
      .then((r) => r.json())
      .then((c: Config) => {
        setConfig(c);
        setAllowedRaw((c.allowedTools || []).join(', '));
        setDeniedRaw((c.deniedTools || []).join(', '));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (agentId) refresh();
  }, [agentId]);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch(`/api/permissions/agent/${encodeURIComponent(agentId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: config.mode ?? '',
          allowedTools: csvToList(allowedRaw),
          deniedTools: csvToList(deniedRaw),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setConfig(data);
        setAllowedRaw((data.allowedTools || []).join(', '));
        setDeniedRaw((data.deniedTools || []).join(', '));
        setMessage('Permissions enregistrées.');
      } else {
        setMessage(data.error || 'Erreur.');
      }
    } catch {
      setMessage('Erreur réseau.');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  const reset = async () => {
    if (!confirm('Remettre cet agent en mode hérité (supprime l\'override) ?')) return;
    setSaving(true);
    try {
      await fetch(`/api/permissions/agent/${encodeURIComponent(agentId)}`, { method: 'DELETE' });
      refresh();
      setMessage('Override supprimé.');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  if (loading) return <div class="text-xs text-gray-400 italic">Chargement…</div>;

  return (
    <div class="space-y-4 text-xs">
      <div>
        <h4 class="text-sm font-bold text-gray-900 mb-1">Mode de permissions</h4>
        <p class="text-[11px] text-gray-500 mb-2">
          Surpasse le mode global pour cet agent uniquement. Les allow/deny listes ci-dessous s'ajoutent au mode choisi.
        </p>
        <select
          value={config.mode ?? ''}
          onChange={(e) =>
            setConfig({
              ...config,
              mode: ((e.target as HTMLSelectElement).value || null) as PermissionMode | null,
            })
          }
          class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs"
        >
          {MODES.map((m) => (
            <option key={m.value || 'inherit'} value={m.value}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label class="block text-[11px] font-semibold text-gray-700 mb-1">
          Outils toujours autorisés pour cet agent
        </label>
        <textarea
          value={allowedRaw}
          onInput={(e) => setAllowedRaw((e.target as HTMLTextAreaElement).value)}
          rows={3}
          class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-mono"
          placeholder="git_status, read_file, gh_pr_list"
        />
      </div>

      <div>
        <label class="block text-[11px] font-semibold text-gray-700 mb-1">
          Outils toujours refusés pour cet agent
        </label>
        <textarea
          value={deniedRaw}
          onInput={(e) => setDeniedRaw((e.target as HTMLTextAreaElement).value)}
          rows={3}
          class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[11px] font-mono"
          placeholder="docker_volume_remove, gh_release_delete"
        />
      </div>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
        {message && <span class="text-[11px] text-emerald-600 mr-auto">{message}</span>}
        <button
          type="button"
          onClick={reset}
          disabled={saving}
          class="rounded-full border border-gray-200 px-3 py-1.5 text-[11px] text-gray-600 hover:bg-gray-50"
        >
          Supprimer l'override
        </button>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          class="rounded-full bg-[#175B37] px-4 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
        >
          {saving ? 'Sauvegarde…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  );
}
