import { useEffect, useState } from 'preact/hooks';

interface Proposal {
  id: number;
  title: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'rejected';
  priority: 'low' | 'medium' | 'high';
  author: string;
  requestType: string;
  projectName: string;
  createdAt: string;
}

export default function DashProposals() {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProposals = async () => {
    try {
      const res = await fetch('/api/agent-proposals');
      const data = await res.json();
      if (data.proposals) setProposals(data.proposals);
    } catch (e) {
      console.error('Erreur fetch proposals:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending': return <span className="badge badge-warning badge-sm">En attente</span>;
      case 'in_progress': return <span className="badge badge-info badge-sm">En cours</span>;
      case 'completed': return <span className="badge badge-success badge-sm">Terminé</span>;
      case 'rejected': return <span className="badge badge-error badge-sm">Rejeté</span>;
      default: return <span className="badge badge-ghost badge-sm">{status}</span>;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'text-red-500';
      case 'medium': return 'text-orange-500';
      case 'low': return 'text-green-500';
      default: return '';
    }
  };

  if (loading) return <div className="flex justify-center p-8"><span className="loading loading-spinner loading-md"></span></div>;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden h-full flex flex-col">
      <div className="p-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
        <h3 className="font-bold text-gray-800 flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          Propositions & Demandes
        </h3>
        <span className="text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded-md border border-gray-200">
          {proposals.length} total
        </span>
      </div>

      <div className="overflow-y-auto flex-1">
        {proposals.length === 0 ? (
          <div className="p-10 text-center text-gray-400 italic text-sm">
            Aucune proposition pour le moment.
          </div>
        ) : (
          <table className="table table-sm w-full">
            <thead className="bg-gray-50/80 sticky top-0 z-10">
              <tr>
                <th className="text-gray-500 font-semibold py-3">Titre</th>
                <th className="text-gray-500 font-semibold py-3">Projet</th>
                <th className="text-gray-500 font-semibold py-3">Type</th>
                <th className="text-gray-500 font-semibold py-3">Statut</th>
              </tr>
            </thead>
            <tbody>
              {proposals.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0">
                  <td className="py-3">
                    <div className="flex flex-col">
                      <span className="font-medium text-gray-800 truncate max-w-[200px]" title={p.title}>{p.title}</span>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${getPriorityColor(p.priority)}`}>
                        {p.priority}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-gray-600 text-xs">{p.projectName || 'N/A'}</td>
                  <td className="py-3">
                    <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium border border-slate-200">
                      {p.requestType}
                    </span>
                  </td>
                  <td className="py-3">{getStatusBadge(p.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      
      <div className="p-3 border-t border-gray-100 bg-gray-50/30 text-center">
        <a href="/proposals" className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
          Voir tout le carnet de bord →
        </a>
      </div>
    </div>
  );
}
