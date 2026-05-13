import { useEffect, useState } from 'preact/hooks';
import AgentToolsPanel from './AgentToolsPanel';
import AgentPermissionEditor from './AgentPermissionEditor';

type Props = {
  agentId: string;
  open: boolean;
  onClose: () => void;
};

type Instruction = {
  agentId: string;
  model: string;
  systemPrompt: string;
  enabled: number;
  updatedAt?: string;
};

export default function AgentConfigModal({ agentId, open, onClose }: Props) {
  const [instruction, setInstruction] = useState<Instruction | null>(null);
  const [prompt, setPrompt] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const [tab, setTab] = useState<'tools' | 'prompt' | 'permissions' | 'meta'>('tools');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!open || !agentId) return;
    void (async () => {
      try {
        const data = await fetch(`/api/agent-instructions?id=${encodeURIComponent(agentId)}`).then((r) => r.json());
        if (data && !data.error) {
          setInstruction(data);
          setPrompt(String(data.systemPrompt || ''));
        }
      } catch {
        /* ignore */
      }
    })();
  }, [open, agentId]);

  if (!open) return null;

  const savePrompt = async () => {
    setSavingPrompt(true);
    setMessage('');
    try {
      const res = await fetch('/api/agent-instructions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, systemPrompt: prompt }),
      });
      const data = await res.json().catch(() => ({}));
      setMessage(res.ok ? 'Prompt sauvegardé.' : data.error || 'Erreur.');
    } finally {
      setSavingPrompt(false);
      setTimeout(() => setMessage(''), 4000);
    }
  };

  return (
    <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        class="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header class="flex items-center justify-between border-b border-gray-100 bg-gradient-to-r from-[#175B37]/5 to-transparent px-5 py-4">
          <div class="min-w-0">
            <p class="text-[10px] font-black uppercase tracking-widest text-[#175B37]">Configuration agent</p>
            <h3 class="truncate text-base font-bold text-gray-900">{agentId}</h3>
            {instruction && (
              <p class="mt-0.5 text-[10px] text-gray-500">
                Modèle : <span class="font-mono text-gray-700">{instruction.model}</span> ·{' '}
                {Number(instruction.enabled) === 1 ? 'actif' : 'désactivé'}
              </p>
            )}
          </div>
          <div class="flex items-center gap-3">
            <a
              href={`/swarm/${encodeURIComponent(agentId)}`}
              class="text-[11px] font-semibold text-[#175B37] hover:underline"
            >
              Page complète →
            </a>
            <button
              onClick={onClose}
              class="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs text-gray-700"
            >
              Fermer
            </button>
          </div>
        </header>

        <nav class="flex gap-1 border-b border-gray-100 bg-gray-50/60 px-5">
          {(
            [
              { id: 'tools', label: 'Outils' },
              { id: 'prompt', label: 'System prompt' },
              { id: 'permissions', label: 'Permissions' },
              { id: 'meta', label: 'Méta' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              class={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold transition ${
                tab === t.id
                  ? 'border-[#175B37] text-[#175B37]'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div class="flex-1 overflow-auto p-5">
          {tab === 'tools' && <AgentToolsPanel agentId={agentId} compact />}

          {tab === 'prompt' && (
            <div class="space-y-3">
              <div>
                <h4 class="text-sm font-bold text-gray-900">System prompt</h4>
                <p class="text-[11px] text-gray-500">
                  Texte injecté en premier dans la conversation. La doctrine d'action et la liste d'outils sont ajoutées
                  automatiquement.
                </p>
              </div>
              <textarea
                value={prompt}
                onInput={(e) => setPrompt((e.target as HTMLTextAreaElement).value)}
                rows={18}
                class="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-mono text-gray-900 outline-none focus:border-[#175B37]"
              />
              <div class="flex items-center justify-end gap-2">
                {message && <span class="text-xs text-emerald-600">{message}</span>}
                <button
                  onClick={savePrompt}
                  disabled={savingPrompt}
                  class="rounded-full bg-[#175B37] px-4 py-2 text-xs font-bold text-white disabled:opacity-50"
                >
                  {savingPrompt ? 'Sauvegarde...' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          )}

          {tab === 'permissions' && <AgentPermissionEditor agentId={agentId} />}

          {tab === 'meta' && (
            <div class="space-y-2 text-xs text-gray-700">
              {instruction ? (
                <>
                  <div>
                    <span class="font-semibold text-gray-900">ID :</span>{' '}
                    <code class="font-mono">{instruction.agentId}</code>
                  </div>
                  <div>
                    <span class="font-semibold text-gray-900">Modèle :</span>{' '}
                    <code class="font-mono">{instruction.model}</code>
                  </div>
                  <div>
                    <span class="font-semibold text-gray-900">Statut :</span>{' '}
                    {Number(instruction.enabled) === 1 ? 'actif' : 'désactivé'}
                  </div>
                  <div>
                    <span class="font-semibold text-gray-900">Dernière maj :</span> {instruction.updatedAt || '—'}
                  </div>
                </>
              ) : (
                <p class="text-gray-400 italic">Pas d'instruction enregistrée pour cet agent.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
