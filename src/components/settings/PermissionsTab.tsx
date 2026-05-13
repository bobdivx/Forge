import { useState, useEffect } from 'preact/hooks';

type PermissionMode = 'autonomous' | 'tiered' | 'plan_first';

type HostInfo = {
  kind: string;
  platform: string;
  isDocker: boolean;
  hasDockerSocket: boolean;
  arch: string;
  hostname: string;
  defaultInfraMode: 'local' | 'remote_ssh';
};

type GlobalConfig = {
  mode: PermissionMode;
  allowedTools: string[];
  deniedTools: string[];
  host?: HostInfo;
};

const MODES: Array<{ value: PermissionMode; label: string; hint: string }> = [
  {
    value: 'autonomous',
    label: 'Autonomie totale',
    hint: 'Tous les outils sont autorisés sauf les patterns dangereux (rm -rf /, push --force main, dd, mkfs, etc.). Audit complet dans le journal d\'activité.',
  },
  {
    value: 'tiered',
    label: 'Approbation graduée',
    hint: 'Outils en lecture seule auto-approuvés. Outils destructifs (delete, drop, force) en demande d\'approbation.',
  },
  {
    value: 'plan_first',
    label: 'Plan d\'abord',
    hint: 'Chaque appel d\'outil exige une approbation explicite. Recommandé pour les opérations sensibles ou la production.',
  },
];

function csvToList(raw: string): string[] {
  return raw
    .split(/[\n,;]/)
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function PermissionsTab() {
  const [config, setConfig] = useState<GlobalConfig>({
    mode: 'autonomous',
    allowedTools: [],
    deniedTools: [],
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [allowedRaw, setAllowedRaw] = useState('');
  const [deniedRaw, setDeniedRaw] = useState('');

  const refresh = () => {
    setLoading(true);
    fetch('/api/permissions/global')
      .then((r) => r.json())
      .then((c) => {
        setConfig(c);
        setAllowedRaw((c.allowedTools || []).join(', '));
        setDeniedRaw((c.deniedTools || []).join(', '));
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const res = await fetch('/api/permissions/global', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: config.mode,
          allowedTools: csvToList(allowedRaw),
          deniedTools: csvToList(deniedRaw),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('Permissions enregistrées.');
        setConfig(data);
        setAllowedRaw((data.allowedTools || []).join(', '));
        setDeniedRaw((data.deniedTools || []).join(', '));
      } else {
        setMessage(data.error || 'Erreur lors de la sauvegarde.');
      }
    } catch {
      setMessage('Erreur réseau.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div class="p-6 animate-pulse text-gray-400">Chargement…</div>;
  }

  return (
    <div class="p-6 space-y-6">
      <header>
        <h2 class="text-lg font-bold text-gray-900">Permissions du moteur</h2>
        <p class="text-sm text-gray-500 mt-1">
          Contrôle global de l'autonomie des agents. Les overrides par agent se configurent depuis la page L'Équipe.
        </p>
      </header>

      {config.host && (
        <div class="rounded-[1rem] bg-gray-50 border border-gray-100 p-4 text-xs text-gray-600 space-y-1">
          <div>
            <span class="font-semibold text-gray-700">Hôte détecté :</span>{' '}
            <code class="text-[#175B37]">{config.host.kind}</code>
            <span class="text-gray-400"> · {config.host.platform}/{config.host.arch}</span>
            {config.host.isDocker && <span class="text-gray-400"> · conteneur</span>}
            {config.host.hasDockerSocket && <span class="text-gray-400"> · docker-socket</span>}
          </div>
          <div>
            <span class="font-semibold text-gray-700">Mode infra par défaut :</span>{' '}
            <code>{config.host.defaultInfraMode}</code>
          </div>
        </div>
      )}

      <section class="space-y-3">
        <h3 class="text-sm font-bold text-gray-900">Mode global</h3>
        <div class="space-y-2">
          {MODES.map((m) => (
            <label
              key={m.value}
              class={`flex gap-3 rounded-[1rem] border p-4 cursor-pointer transition-colors ${
                config.mode === m.value ? 'border-[#175B37] bg-[#175B37]/5' : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="mode"
                value={m.value}
                checked={config.mode === m.value}
                onChange={() => setConfig({ ...config, mode: m.value })}
                class="mt-1"
              />
              <div>
                <div class="font-semibold text-gray-900">{m.label}</div>
                <div class="text-xs text-gray-500 mt-1">{m.hint}</div>
              </div>
            </label>
          ))}
        </div>
      </section>

      <section class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="text-sm font-semibold text-gray-700 block mb-2">
            Outils toujours autorisés
            <span class="block text-xs font-normal text-gray-400 mt-1">
              Liste séparée par virgules ou retours à la ligne.
            </span>
          </label>
          <textarea
            value={allowedRaw}
            onInput={(e) => setAllowedRaw((e.target as HTMLTextAreaElement).value)}
            class="w-full min-h-[120px] rounded-[1rem] border border-gray-200 p-3 text-sm font-mono"
            placeholder="read_file, git_status, gh_pr_list"
          />
        </div>
        <div>
          <label class="text-sm font-semibold text-gray-700 block mb-2">
            Outils toujours refusés
            <span class="block text-xs font-normal text-gray-400 mt-1">
              Surpasse le mode autonome (en plus des hard-deny patterns codés en dur).
            </span>
          </label>
          <textarea
            value={deniedRaw}
            onInput={(e) => setDeniedRaw((e.target as HTMLTextAreaElement).value)}
            class="w-full min-h-[120px] rounded-[1rem] border border-gray-200 p-3 text-sm font-mono"
            placeholder="docker_volume_remove, gh_release_delete"
          />
        </div>
      </section>

      <section class="rounded-[1rem] bg-yellow-50 border border-yellow-200 p-4 text-xs text-yellow-900">
        <strong>Hard-deny non négociable :</strong> certaines commandes restent toujours bloquées,
        même en mode autonome — <code>rm -rf /</code>, <code>git push --force main</code>,
        <code> dd of=/dev/...</code>, <code>mkfs</code>, <code>shutdown</code>, fork bomb, etc.
      </section>

      <div class="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          class="px-5 py-2 rounded-full bg-[#175B37] text-white text-sm font-semibold disabled:opacity-50"
        >
          {saving ? 'Sauvegarde…' : 'Enregistrer'}
        </button>
        <button
          type="button"
          onClick={refresh}
          class="px-5 py-2 rounded-full border border-gray-200 text-sm text-gray-700 hover:bg-gray-50"
        >
          Annuler
        </button>
        {message && <span class="text-sm text-gray-600">{message}</span>}
      </div>
    </div>
  );
}
