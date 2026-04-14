import { useEffect, useState } from 'preact/hooks';

type Activity = { title: string; detail: string; time: string; tone: string };

export default function SwarmActivities() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [stats, setStats] = useState({ activeCount: 0, idleCount: 0, totalSessions: 0, uniqueAgents: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/openclaw-swarm-stats')
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(String(d.error));
        setActivities(Array.isArray(d.activities) ? d.activities : []);
        setStats({ activeCount: d.activeCount ?? 0, idleCount: d.idleCount ?? 0, totalSessions: d.totalSessions ?? 0, uniqueAgents: d.uniqueAgents ?? 0 });
        setLoading(false);
      })
      .catch(() => { setError('Chargement impossible'); setLoading(false); });
  }, []);

  return (
    <>
      <div class="bg-slate-900/50 border border-slate-800 rounded-xl p-6 backdrop-blur-sm">
        <h3 class="font-bold text-white mb-6 border-b border-slate-800 pb-3 uppercase tracking-widest text-xs text-slate-500">Activité récente (sessions OpenClaw)</h3>
        {error && <p class="text-xs text-amber-400 mb-4">{error}</p>}
        {loading ? (
          <p class="text-sm text-slate-500 animate-pulse">Chargement…</p>
        ) : activities.length === 0 ? (
          <p class="text-sm text-slate-500">Aucune session renvoyée par le gateway.</p>
        ) : (
          <div class="space-y-6">
            {activities.map((a, i) => (
              <div class={`flex gap-4 group ${i > 0 ? 'border-t border-slate-800/50 pt-6' : ''}`} key={`${a.title}-${i}`}>
                <div class={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.tone === 'blue' ? 'bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]' : 'bg-slate-400 shadow-[0_0_8px_rgba(148,163,184,0.5)]'}`} />
                <div>
                  <p class="text-sm font-medium text-white">{a.title}</p>
                  <p class="text-xs text-slate-500 mt-1 leading-relaxed">{a.detail}</p>
                  <span class="text-[10px] text-slate-600 font-mono mt-2 block">{a.time}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Sessions actives</span>
          <div class="text-3xl font-bold text-white mt-1">{stats.activeCount}</div>
        </div>
        <div class="bg-slate-900 border border-slate-800 p-4 rounded-xl">
          <span class="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Total sessions</span>
          <div class="text-3xl font-bold text-white mt-1">{stats.totalSessions}<span class="text-sm font-normal text-slate-500 ml-2">{stats.uniqueAgents} agent(s) distincts</span></div>
        </div>
      </div>
    </>
  );
}
