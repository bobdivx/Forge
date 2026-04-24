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
  appHttpUrl?: string;
  appName?: string;
};

function truncate(s: string, max: number) {
  const t = String(s ?? '').trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1).trimEnd() + '…';
}

export default function GitHistoryCard({ commits, gitLogError, isRepo, appHttpUrl, appName }: Props) {
  const list = Array.isArray(commits) ? commits : [];
  const [open, setOpen] = useState(false);
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [diffContent, setDiffContent] = useState<string | null>(null);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const latest = list[0];

  useEffect(() => {
    if (!open && !selectedCommit) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (selectedCommit) {
          setSelectedCommit(null);
          setDiffContent(null);
        } else {
          setOpen(false);
        }
      }
    }
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, selectedCommit]);

  const fetchDiff = async (hash: string) => {
    if (!appName) return;
    setSelectedCommit(hash);
    setLoadingDiff(true);
    setDiffContent(null);
    try {
      const res = await fetch(`/api/git-commit?app=${appName}&hash=${hash}`);
      if (res.ok) {
        const data = await res.json();
        setDiffContent(data.diff);
      } else {
        setDiffContent('Erreur lors du chargement des modifications.');
      }
    } catch (e) {
      setDiffContent('Erreur réseau.');
    } finally {
      setLoadingDiff(false);
    }
  };

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
                Historique Git & Modifications
              </h3>
              {!disabled && (
                <p class="text-[11px] text-gray-400 mt-1">
                  Cliquez pour voir le détail des modifications des agents
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
                <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-white border border-gray-100 text-[#175B37] font-bold">
                  {latest.shortHash}
                </span>
                <span class="text-[11px] text-gray-400">{latest.date}</span>
              </div>
              <p class="text-sm font-medium text-gray-900 leading-snug">{truncate(latest.subject, 140)}</p>
              <p class="text-xs text-gray-500">
                <span class="text-gray-400">Par · </span>
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
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              if (selectedCommit) {
                setSelectedCommit(null);
                setDiffContent(null);
              } else {
                setOpen(false);
              }
            }
          }}
        >
          <div
            class="w-full max-w-3xl max-h-[85vh] bg-white rounded-2xl shadow-xl border border-gray-100 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div class="flex items-center justify-between gap-3 px-5 py-4 border-b border-gray-100 shrink-0 bg-gray-50">
              <h2 class="text-base font-bold text-gray-900">
                {selectedCommit ? 'Détails de la modification' : 'Journal des modifications'}
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (selectedCommit) {
                    setSelectedCommit(null);
                    setDiffContent(null);
                  } else {
                    setOpen(false);
                  }
                }}
                class="rounded-full p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
              >
                <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {selectedCommit ? (
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  ) : (
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                  )}
                </svg>
              </button>
            </div>

            <div class="overflow-y-auto flex-1 p-5">
              {!selectedCommit ? (
                <div class="space-y-4">
                  {list.map((c) => (
                    <article
                      key={c.hash}
                      class="border border-gray-100 rounded-xl p-4 bg-white hover:border-[#175B37]/30 hover:shadow-sm transition-all"
                    >
                      <div class="flex items-start justify-between gap-3">
                        <div class="flex-1">
                          <h4 class="font-bold text-gray-900 text-sm mb-1 break-words">{c.subject}</h4>
                          <div class="flex items-center gap-3 text-[11px]">
                            <span class="text-gray-500 font-mono bg-gray-100 px-1.5 py-0.5 rounded">{c.shortHash}</span>
                            <span class="text-gray-400 flex items-center gap-1">
                              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              {c.author}
                            </span>
                            <span class="text-gray-400 flex items-center gap-1">
                              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                              {c.date}
                            </span>
                          </div>
                        </div>
                        {appName && (
                          <button
                            onClick={() => fetchDiff(c.hash)}
                            class="shrink-0 text-xs font-medium bg-[#E9F3EB] text-[#175B37] px-3 py-1.5 rounded-lg hover:bg-[#dceee0] transition-colors whitespace-nowrap"
                          >
                            Voir le code
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div class="h-full flex flex-col">
                  {loadingDiff ? (
                    <div class="flex items-center justify-center flex-1 text-[#175B37]">
                      <div class="w-6 h-6 border-2 border-[#175B37]/30 border-t-[#175B37] rounded-full animate-spin"></div>
                      <span class="ml-3 text-sm font-medium">Chargement du diff...</span>
                    </div>
                  ) : (
                    <pre class="bg-[#1e1e1e] text-gray-300 p-4 rounded-xl text-xs font-mono overflow-auto flex-1 whitespace-pre-wrap break-all custom-scrollbar">
                      {diffContent}
                    </pre>
                  )}
                </div>
              )}
            </div>
            
            <div class="px-5 py-3 border-t border-gray-100 bg-gray-50 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (selectedCommit) {
                    setSelectedCommit(null);
                    setDiffContent(null);
                  } else {
                    setOpen(false);
                  }
                }}
                class="px-5 py-2 rounded-xl text-sm font-medium bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
              >
                {selectedCommit ? 'Retour' : 'Fermer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
