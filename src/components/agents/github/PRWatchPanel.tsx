import { useState } from 'preact/hooks';

type Decision = {
  id: number;
  projectId: number;
  prNumber: number;
  prTitle: string | null;
  prAuthor: string | null;
  decision: string;
  justification: string | null;
  requestId: number | null;
  provider: string;
  createdAt: string;
};

const DECISION_BADGES: Record<string, { label: string; cls: string }> = {
  useful: { label: 'Utile', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  duplicate: { label: 'Doublon', cls: 'bg-amber-50 text-amber-800 border-amber-200' },
  already_done: { label: 'Déjà fait', cls: 'bg-gray-50 text-gray-600 border-gray-200' },
  needs_more_info: { label: 'Plus d\'info', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  ignored: { label: 'Ignoré', cls: 'bg-gray-50 text-gray-500 border-gray-200' },
};

export default function PRWatchPanel({ decisions, onReanalyze }: { decisions: Decision[]; onReanalyze: () => void }) {
  const [busy, setBusy] = useState<number | null>(null);

  const reanalyze = async (projectId: number, prNumber: number) => {
    setBusy(prNumber);
    try {
      await fetch('/api/agents/github/reanalyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, prNumber }),
      });
      onReanalyze();
    } finally {
      setBusy(null);
    }
  };

  return (
    <section class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden">
      <header class="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div class="w-1 h-6 rounded-full bg-[#175B37]" />
        <h2 class="text-base font-bold text-gray-900">Pull Requests analysées</h2>
        <span class="text-[10px] uppercase tracking-widest text-gray-400 ml-2">
          {decisions.length} décision(s)
        </span>
      </header>
      {decisions.length === 0 ? (
        <div class="p-8 text-center text-sm text-gray-400">
          Aucune décision encore enregistrée. Lancez un scan ou attendez le prochain cycle automatique.
        </div>
      ) : (
        <div class="divide-y divide-gray-100">
          {decisions.map((d) => {
            const badge = DECISION_BADGES[d.decision] || DECISION_BADGES.needs_more_info;
            return (
              <div key={d.id} class="px-6 py-4 hover:bg-gray-50 transition-colors">
                <div class="flex items-start gap-3">
                  <span class={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase border ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-semibold text-gray-900 truncate">
                      PR #{d.prNumber} · {d.prTitle || '(sans titre)'}
                    </div>
                    <div class="text-xs text-gray-500 mt-1 truncate">
                      Projet #{d.projectId} · @{d.prAuthor || 'inconnu'} · {d.provider}
                    </div>
                    {d.justification && (
                      <p class="text-xs text-gray-600 mt-2 line-clamp-2">{d.justification}</p>
                    )}
                    {d.requestId && (
                      <a href={`/work?requestId=${d.requestId}`} class="text-[11px] text-[#175B37] font-semibold hover:underline mt-1 inline-block">
                        Voir la tâche créée →
                      </a>
                    )}
                  </div>
                  <button
                    onClick={() => reanalyze(d.projectId, d.prNumber)}
                    disabled={busy === d.prNumber}
                    class="shrink-0 text-[11px] text-gray-500 hover:text-[#175B37] disabled:opacity-50"
                  >
                    {busy === d.prNumber ? 'Re-analyse…' : 'Re-analyser'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
