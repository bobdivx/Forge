import { useState, useEffect } from 'preact/hooks';

interface Approval {
  id: number;
  agentId: string;
  type: string;
  title: string;
  payload?: string;
  status: string;
  feedback?: string;
  createdAt: string;
}

const TYPE_COLORS: Record<string, string> = {
  hire: 'bg-indigo-100 text-indigo-700',
  dep: 'bg-blue-100 text-blue-700',
  budget: 'bg-emerald-100 text-emerald-700',
  policy: 'bg-purple-100 text-purple-700',
  code_change: 'bg-amber-100 text-amber-700',
  generic: 'bg-gray-100 text-gray-700',
};

export default function ApprovalPanel() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<number | null>(null);

  const fetch_ = async () => {
    try {
      const res = await fetch('/api/approvals');
      const data = await res.json();
      if (data.approvals) setApprovals(data.approvals);
      else if (data.error) setError(data.error);
    } catch {
      setError('Erreur lors du chargement des approbations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch_();
    const t = setInterval(fetch_, 10000);
    return () => clearInterval(t);
  }, []);

  const handleDecision = async (id: number, status: 'approved' | 'rejected') => {
    setProcessingId(id);
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status })
      });
      if (res.ok) {
        setApprovals(prev => prev.filter(a => a.id !== id));
      }
    } catch {
      alert('Erreur lors de la mise à jour');
    } finally {
      setProcessingId(null);
    }
  };

  if (loading && approvals.length === 0) return (
    <div class="flex justify-center p-12">
      <div class="w-8 h-8 border-2 border-gray-200 border-t-[#175B37] rounded-full animate-spin" />
    </div>
  );

  if (approvals.length === 0) return (
    <div class="bg-white border border-gray-100 rounded-[1.5rem] shadow-sm p-12 text-center">
      <div class="text-4xl mb-4">Inbox vide</div>
      <p class="text-gray-500 text-sm">Aucune demande d'approbation en attente.</p>
    </div>
  );

  return (
    <div class="space-y-6">
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        {approvals.map(a => (
          <div key={a.id} class="bg-white border border-gray-100 rounded-[2rem] shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
            <div class="p-6 flex-1 space-y-4">
              <div class="flex items-center justify-between">
                <span class={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full ${TYPE_COLORS[a.type] || TYPE_COLORS.generic}`}>
                  {a.type}
                </span>
                <span class="text-[10px] text-gray-400 font-mono">#{a.id}</span>
              </div>
              
              <div>
                <h3 class="text-lg font-bold text-gray-900 leading-tight">{a.title}</h3>
                <p class="text-xs text-gray-500 mt-1">demandé par <span class="font-mono text-[#175B37]">{a.agentId}</span></p>
              </div>

              {a.payload && (
                <div class="bg-gray-50 rounded-xl p-4 overflow-x-auto">
                  <pre class="text-[10px] text-gray-600 font-mono">{JSON.stringify(JSON.parse(a.payload), null, 2)}</pre>
                </div>
              )}
            </div>

            <div class="px-6 py-4 bg-gray-50/50 border-t border-gray-100 flex gap-3">
              <button 
                onClick={() => handleDecision(a.id, 'rejected')}
                disabled={processingId === a.id}
                class="flex-1 py-2 px-4 rounded-full border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                Refuser
              </button>
              <button 
                onClick={() => handleDecision(a.id, 'approved')}
                disabled={processingId === a.id}
                class="flex-1 py-2 px-4 rounded-full bg-[#175B37] text-white text-sm font-semibold hover:bg-[#134a2d] transition-transform active:scale-95 disabled:opacity-50"
              >
                Approuver
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
