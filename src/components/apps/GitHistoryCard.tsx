import { useState, useEffect } from 'preact/hooks';

export type GitCommitUi = {
  hash: string;
  shortHash: string;
  author: string;
  date: string;
  dateIso?: string;
  subject: string;
};

type Props = {
  commits: GitCommitUi[];
  gitLogError: string | null;
  isRepo: boolean;
  /** Lien optionnel (vhost dev) */
  appHttpUrl?: string;
};

function truncate(s: string, max: number) {
  const t = String(s ?? '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '…';
}

export default function GitHistoryCard({ commits, gitLogError, isRepo, appHttpUrl }: Props) {
  const list = Array.isArray(commits) ? commits : [];
  const [open, setOpen] = useState(false);
  const latest = list[0];

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const disabled = list.length === 0;

  return (
    <>
      <section class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 overflow-hidden">
        <button
          type="button"
          disabled={disabled && !gitLogError}
          onClick={() => {
            if (!disabled || list.length > 0) setOpen(true);
          }}
          class={`w-full text-left p-6 transition-colors group ${
            disabled && !gitLogError
              ? 'cursor-default opacity-90'
              : 'cursor-pointer hover:bg-gray-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37]/30 focus-visible:ring-offset-2'
          }`}
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <div class="flex items-start justify-between gap-4 mb-4">
            <div>
              <h3 class="text-base font-semibold text-gray-900 group-hover:text-[#175B37] transition-colors">
                Historique Git
              </h3>
              {!disabled && (
                <p class="text-[11px] text-gray-400 mt-1">
                  Cliquez pour voir les {list.length} dernier{list.length > 1 ? 's' : ''} commit{list.length > 1 ? 's' : ''}
                </p>
              )}
            </div>
            <div class="flex flex-col items-end gap-1 shrink-0">
              {appHttpUrl && (
                <a
                  href={appHttpUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  class="text-xs text-blue-500 hover:underline font-mono"
                >
                  {appHttpUrl.replace(/^https?:\/\//, '')}
                </a>
              )}
              {!disabled && (
                <span class="text-[11px] font-medium text-[#175B37] opacity-0 group-hover:opacity-100 transition-opacity">
                  Voir tout →
                </span>
              )}
            </div>
          </div>

          {gitLogError && (
            <div class="rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-800 mb-3">
              {gitLogError}
            </div>
          )}

          {latest ? (
            <div class="rounded-xl border border-gray-100 bg-gray-50/80 p-4 space-y-2">
              <div class="flex items-center justify-between gap-2 flex-wrap">
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-gray-100 text-gray-600">
                  {latest.shortHash}
                </span>
                <span class="text-[11px] text-gray-400">{latest.date}</span>
              </div>
              <p class="text-sm font-medium text-gray-900 leading-snug">{truncate(latest.subject, 140)}</p>
              <p class="text-xs text-gray-500">
                <span class="text-gray-400">Auteur · </span>
                <span class="font-mono text-[#175B37]">{latest.author}</span>
              </p>
            </div>
          ) : (
            <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-400">
              {isRepo
                ? 'Aucun commit lisible (dépôt vide ou erreur git log).'
                : 'Initialisez un dépôt Git dans ce dossier pour afficher l’historique.'}
            </div>
          )}
        </button>
      </section>

      {open && list.length > 0 && (
        <div
          class="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4 sm:p-6 bg-black/40 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="git-history-modal-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            class="w-full max-w-lg max-h-[85vh] bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0">
              <h2 id="git-history-modal-title" class="text-base font-semibold text-gray-900">
                Historique Git
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                class="rounded-full p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                aria-label="Fermer"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div class="overflow-y-auto flex-1 px-5 py-4 space-y-3">
              {list.map((c) => (
                <article
                  key={c.hash}
                  class="border border-gray-100 rounded-xl p-4 bg-gray-50 hover:bg-gray-100/80 transition-colors"
                >
                  <div class="flex items-start justify-between gap-3">
                    <h4 class="font-medium text-gray-900 text-sm break-words flex-1">{c.subject}</h4>
                    <span class="text-[11px] text-gray-400 shrink-0 whitespace-nowrap">{c.date}</span>
                  </div>
                  <p class="text-gray-500 mt-1.5 font-mono text-[11px]">
                    {c.shortHash} — {c.hash}
                  </p>
                  <p class="text-xs text-gray-400 mt-2">
                    Auteur : <span class="font-mono text-[#175B37]">{c.author}</span>
                  </p>
                </article>
              ))}
            </div>
            <div class="px-5 py-3 border-t border-gray-100 bg-gray-50/80 shrink-0">
              <button
                type="button"
                onClick={() => setOpen(false)}
                class="w-full sm:w-auto px-4 py-2 rounded-full text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-50"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
