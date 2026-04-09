import { useState, useEffect } from 'preact/hooks';

type Issue = { id: number; title: string; errorType: string; status: string; reportedByAgentId: string };
type Proposal = { id: number; title: string; priority: string; author: string; projectName: string };

export default function DashNextTask() {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([fetch('/api/agent-issues'), fetch('/api/agent-proposals')])
      .then(async ([ir, pr]) => {
        const id = await ir.json().catch(() => ({}));
        const pd = await pr.json().catch(() => ({}));
        const issues: Issue[] = Array.isArray(id.issues) ? id.issues : [];
        const proposals: Proposal[] = Array.isArray(pd.proposals) ? pd.proposals : [];
        setIssue(issues.find((i) => /^(open|in_progress)$/i.test(i.status)) ?? null);
        setProposal(proposals.find((p) => /^(pending|in_progress)$/i.test(p.status)) ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const hasItem = issue || proposal;
  const title = issue ? issue.title : proposal?.title ?? '';
  const subtitle = issue
    ? `Type : ${issue.errorType}`
    : proposal
    ? `Projet : ${proposal.projectName || 'Forge'} — ${proposal.priority}`
    : '';
  const href = '/work';
  const btnLabel = issue ? 'Traiter l\'anomalie' : 'Voir la proposition';

  return (
    <div class="bg-white p-6 rounded-[1.5rem] shadow-sm flex flex-col justify-between" style="min-height:280px">
      <div>
        <h3 class="font-semibold text-gray-800 mb-4">Rappels</h3>
        {loading ? (
          <div class="space-y-3">
            <div class="h-6 bg-gray-100 rounded animate-pulse" />
            <div class="h-4 w-2/3 bg-gray-100 rounded animate-pulse" />
          </div>
        ) : hasItem ? (
          <>
            <h4 class="text-xl font-bold text-gray-800 mb-1 leading-tight">{title}</h4>
            <p class="text-sm text-gray-400 mb-6">{subtitle}</p>
          </>
        ) : (
          <>
            <h4 class="text-xl font-bold text-gray-800 mb-1 leading-tight">Forge opérationnelle</h4>
            <p class="text-sm text-gray-400 mb-6">Aucune anomalie ni proposition en attente</p>
          </>
        )}
      </div>
      <a
        href={href}
        class="w-full py-3 rounded-2xl flex items-center justify-center gap-2 font-medium text-sm text-white transition-colors hover:opacity-90"
        style={{ background: '#175B37' }}
      >
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
        </svg>
        {loading ? 'Chargement…' : hasItem ? btnLabel : 'Voir le carnet'}
      </a>
    </div>
  );
}
