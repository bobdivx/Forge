import { useState, useEffect } from 'preact/hooks';

type AppIssue = {
  id: number;
  url: string;
  errorType: string;
  title: string;
  detail?: string | null;
  status: string;
  reportedByAgentId: string;
  assigneeAgentId?: string | null;
  createdAt: string;
};

type DepRequest = {
  id: number;
  packageName: string;
  versionSpec?: string | null;
  isDev: number;
  reason?: string | null;
  status: string;
  requestedByAgentId: string;
  assigneeAgentId?: string | null;
  createdAt: string;
};

type Proposal = {
  id: number;
  title: string;
  content: string;
  status: string;
  priority: string;
  author: string;
  requestType: string;
  createdAt: string;
  projectName: string;
};

function statusClass(st: string) {
  const s = String(st).toLowerCase();
  if (s === 'resolved' || s === 'installed' || s === 'completed') return 'badge-success';
  if (s === 'rejected' || s === 'wont_fix') return 'badge-error';
  if (s === 'in_progress') return 'badge-info animate-pulse';
  return 'badge-warning';
}

export default function ForgeOrchestrationBoard() {
  const [tab, setTab] = useState<'issues' | 'deps' | 'proposals'>('issues');
  const [issues, setIssues] = useState<AppIssue[]>([]);
  const [deps, setDeps] = useState<DepRequest[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    Promise.all([
      fetch('/api/agent-issues'),
      fetch('/api/agent-dependencies'),
      fetch('/api/agent-proposals')
    ])
      .then(async ([ir, dr, pr]) => {
        const ij = await ir.json().catch(() => ({}));
        const dj = await dr.json().catch(() => ({}));
        const pj = await pr.json().catch(() => ({}));
        if (!ir.ok) setErr(typeof ij.error === 'string' ? ij.error : 'Données indisponibles');
        else {
          setErr(null);
          setIssues(Array.isArray(ij.issues) ? ij.issues : []);
          setDeps(Array.isArray(dj.requests) ? dj.requests : []);
          setProposals(Array.isArray(pj.proposals) ? pj.proposals : []);
        }
      })
      .catch(() => setErr('Réseau'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, []);

  const openIssues = issues.filter((i) => /^(open|in_progress)$/i.test(i.status)).length;
  const openDeps = deps.filter((d) => /^(open|in_progress)$/i.test(d.status)).length;
  const openProposals = proposals.filter((p) => /^(pending|in_progress)$/i.test(p.status)).length;

  return (
    <div class="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden min-w-0">
      <div class="p-5 sm:p-6 border-b border-slate-800 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div class="min-w-0">
          <h3 class="text-sm font-bold text-white tracking-tight">File d’orchestration Forge</h3>
          <p class="text-[10px] text-slate-500 mt-0.5 leading-relaxed">
            Anomalies, dépendances &amp; propositions — alimenté par les agents (forge-hook ou API).
          </p>
        </div>
        <div class="flex flex-wrap gap-3 sm:justify-end min-w-0">
          {(['issues', 'deps', 'proposals'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              class={`text-[11px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-lg border font-medium transition whitespace-nowrap ${
                tab === k
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-200'
                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-600'
              }`}
            >
              {k === 'issues' ? `Anomalies (${openIssues})` : k === 'deps' ? `Dépendances (${openDeps})` : `Propositions (${openProposals})`}
            </button>
          ))}
        </div>
      </div>

      {err && (
        <div class="px-5 py-2 text-xs text-amber-300 bg-amber-500/10 border-b border-amber-500/20">{err}</div>
      )}

      <div class="overflow-x-auto min-h-[200px]">
        {loading ? (
          <div class="p-10 text-center text-slate-500 text-sm animate-pulse">Chargement…</div>
        ) : tab === 'issues' ? (
          <table class="table table-zebra w-full text-xs">
            <thead>
              <tr class="text-slate-500 border-slate-800">
                <th class="text-[10px] uppercase">Statut</th>
                <th class="text-[10px] uppercase">URL / type</th>
                <th class="text-[10px] uppercase">Titre</th>
                <th class="text-[10px] uppercase">Agents</th>
                <th class="text-[10px] uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {issues.length === 0 ? (
                <tr>
                  <td colspan={5} class="text-center py-10 text-slate-500 italic">
                    Aucune anomalie en base.
                  </td>
                </tr>
              ) : (
                issues.map((i) => (
                  <tr key={i.id} class="border-slate-800/50">
                    <td>
                      <span class={`badge badge-xs ${statusClass(i.status)}`}>{i.status}</span>
                    </td>
                    <td class="font-mono text-[10px] text-slate-400 max-w-[180px] truncate" title={i.url}>
                      {i.errorType} · {i.url}
                    </td>
                    <td class="text-slate-200 max-w-[220px] truncate" title={i.title}>
                      {i.title}
                    </td>
                    <td class="text-[10px] text-slate-500">
                      <div>↳ {i.reportedByAgentId}</div>
                      {i.assigneeAgentId && <div>→ {i.assigneeAgentId}</div>}
                    </td>
                    <td class="text-[10px] text-slate-500 whitespace-nowrap">
                      {new Date(i.createdAt).toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : tab === 'deps' ? (
          <table class="table table-zebra w-full text-xs">
            <thead>
              <tr class="text-slate-500 border-slate-800">
                <th class="text-[10px] uppercase">Statut</th>
                <th class="text-[10px] uppercase">Paquet</th>
                <th class="text-[10px] uppercase">Raison</th>
                <th class="text-[10px] uppercase">Agents</th>
                <th class="text-[10px] uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {deps.length === 0 ? (
                <tr>
                  <td colspan={5} class="text-center py-10 text-slate-500 italic">
                    Aucune demande.
                  </td>
                </tr>
              ) : (
                deps.map((d) => (
                  <tr key={d.id} class="border-slate-800/50">
                    <td>
                      <span class={`badge badge-xs ${statusClass(d.status)}`}>{d.status}</span>
                    </td>
                    <td class="font-mono text-[10px] text-blue-300">
                      {d.packageName}
                      {d.versionSpec ? `@${d.versionSpec}` : ''}
                      <span class="text-slate-600">{d.isDev ? ' (dev)' : ''}</span>
                    </td>
                    <td class="text-slate-400 max-w-[200px] truncate" title={d.reason ?? ''}>
                      {d.reason ?? '—'}
                    </td>
                    <td class="text-[10px] text-slate-500">
                      <div>↳ {d.requestedByAgentId}</div>
                      {d.assigneeAgentId && <div>→ {d.assigneeAgentId}</div>}
                    </td>
                    <td class="text-[10px] text-slate-500 whitespace-nowrap">
                      {new Date(d.createdAt).toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        ) : (
          <table class="table table-zebra w-full text-xs">
            <thead>
              <tr class="text-slate-500 border-slate-800">
                <th class="text-[10px] uppercase">Statut</th>
                <th class="text-[10px] uppercase">Projet</th>
                <th class="text-[10px] uppercase">Titre / Proposition</th>
                <th class="text-[10px] uppercase">Auteur</th>
                <th class="text-[10px] uppercase">Date</th>
              </tr>
            </thead>
            <tbody>
              {proposals.length === 0 ? (
                <tr>
                  <td colspan={5} class="text-center py-10 text-slate-500 italic">
                    Aucune proposition en base.
                  </td>
                </tr>
              ) : (
                proposals.map((p) => (
                  <tr key={p.id} class="border-slate-800/50">
                    <td>
                      <span class={`badge badge-xs ${statusClass(p.status)}`}>{p.status}</span>
                    </td>
                    <td class="text-blue-400 font-bold">
                      {p.projectName || 'Forge'}
                    </td>
                    <td class="text-slate-200 max-w-[220px] truncate" title={p.content}>
                      {p.title}
                    </td>
                    <td class="text-[10px] text-slate-500">
                      {p.author}
                    </td>
                    <td class="text-[10px] text-slate-500 whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleString('fr-FR')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
