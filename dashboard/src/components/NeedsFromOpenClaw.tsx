import { useEffect, useState } from 'preact/hooks';

type Item = {
  agent: string;
  tool: string;
  reason: string;
  status: string;
  priority: string;
  actionRequired: string;
};

export default function NeedsFromOpenClaw() {
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/openclaw-needs')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(String(d.error));
        setItems(Array.isArray(d.items) ? d.items : []);
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setError('Erreur réseau');
      });
  }, []);

  if (loading) {
    return <p class="text-slate-500 animate-pulse">Chargement des agents observés sur OpenClaw…</p>;
  }

  if (error && items.length === 0) {
    return (
      <div class="bg-amber-500/10 border border-amber-500/30 rounded-xl p-6 text-amber-200 text-sm">{error}</div>
    );
  }

  if (items.length === 0) {
    return (
      <p class="text-slate-500 text-sm">
        Aucun agent listé : connectez le gateway ou créez des sessions dans OpenClaw.
      </p>
    );
  }

  return (
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      {items.map((req) => (
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6 relative overflow-hidden" key={req.agent}>
          {req.priority === 'Haute' && (
            <div class="absolute top-0 right-0 bg-amber-500/20 text-amber-400 border-b border-l border-amber-500/30 text-xs font-bold px-3 py-1 rounded-bl-lg uppercase tracking-wider">
              Actif
            </div>
          )}
          <div class="flex items-center gap-3 mb-4">
            <span class="px-2.5 py-1 bg-slate-800 rounded text-xs font-mono text-blue-400">{req.agent}</span>
            <span class="text-sm font-semibold text-white">{req.tool}</span>
          </div>
          <p class="text-sm text-slate-300 mb-4">{req.reason}</p>

          <div class="bg-slate-950 border border-slate-800 rounded-lg p-4">
            <div class="text-xs text-slate-500 mb-2 uppercase tracking-wider font-semibold">Note</div>
            <p class="text-xs text-slate-400 font-mono block mb-4 p-2 bg-black/50 rounded border border-white/5">
              {req.actionRequired}
            </p>
            <div class="flex justify-between items-center border-t border-slate-800 pt-3">
              <span class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium bg-slate-800 text-slate-300 border border-slate-700">
                {req.status}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
