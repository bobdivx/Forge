import { useEffect, useState } from 'preact/hooks';

type Order = {
  id: string;
  date: string;
  agent: string;
  target: string;
  task: string;
  status: string;
};

export default function OrchestrationJournal() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/openclaw-orchestration')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(String(d.error));
        setOrders(Array.isArray(d.orders) ? d.orders : []);
        setLoading(false);
      })
      .catch(() => {
        setError('Impossible de charger le journal');
        setLoading(false);
      });
  }, []);

  if (loading) {
    return <p class="text-slate-500 text-sm animate-pulse py-8 text-center">Chargement du journal OpenClaw…</p>;
  }

  if (error && orders.length === 0) {
    return (
      <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-amber-200 text-sm">
        {error} — vérifiez le jeton OpenClaw dans les paramètres et l’URL du gateway (
        <code class="text-xs">OPENCLAW_GATEWAY_URL</code>).
      </div>
    );
  }

  if (orders.length === 0) {
    return <p class="text-slate-500 text-sm py-8 text-center">Aucune session à afficher.</p>;
  }

  return (
    <div class="overflow-x-auto">
      <table class="table table-zebra w-full text-slate-300">
        <thead class="bg-slate-800/50 text-[10px] uppercase tracking-widest text-slate-500 border-b border-slate-800">
          <tr>
            <th class="px-6 py-4">ID / Date</th>
            <th class="px-6 py-4">Agent / Modèle</th>
            <th class="px-6 py-4">Session</th>
            <th class="px-6 py-4">État</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-800/50">
          {orders.map((order) => (
            <tr class="hover:bg-slate-800/30 transition border-slate-800/50" key={order.id}>
              <td class="px-6 py-4 whitespace-nowrap">
                <span class="font-mono text-xs text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">{order.id}</span>
                <div class="text-[10px] text-slate-500 mt-1.5 font-mono">{order.date}</div>
              </td>
              <td class="px-6 py-4">
                <div class="flex items-center gap-2 flex-wrap">
                  <span class="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[10px] font-bold text-slate-300">
                    {order.agent}
                  </span>
                  <span class="text-slate-600">→</span>
                  <span class="px-2 py-1 bg-slate-950 border border-emerald-500/20 rounded text-[10px] font-mono text-emerald-400">
                    {order.target}
                  </span>
                </div>
              </td>
              <td class="px-6 py-4 text-sm font-mono text-slate-400 break-all max-w-md">{order.task}</td>
              <td class="px-6 py-4">
                <span
                  class={`badge badge-sm gap-1.5 text-[10px] font-bold uppercase py-3 px-3 ${
                    order.status === 'En cours' ? 'badge-success badge-outline' : 'badge-ghost'
                  }`}
                >
                  {order.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
