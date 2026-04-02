import { useEffect, useState } from 'preact/hooks';

export default function OpenClawGatewayBadge() {
  const [state, setState] = useState<{
    reachable: boolean;
    sessionCount: number;
    runningCount: number;
    error?: string;
  } | null>(null);

  useEffect(() => {
    const load = () => {
      fetch('/api/openclaw-health')
        .then((r) => r.json())
        .then(setState)
        .catch(() => setState({ reachable: false, sessionCount: 0, runningCount: 0, error: 'Réseau' }));
    };
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  if (!state) {
    return (
      <span class="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-2.5 py-1 text-xs font-medium text-slate-400 border border-slate-700">
        OpenClaw…
      </span>
    );
  }

  if (!state.reachable) {
    return (
      <span
        class="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 border border-amber-500/20"
        title={state.error || 'Gateway injoignable ou token manquant'}
      >
        <span class="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
        OpenClaw : hors ligne
      </span>
    );
  }

  return (
    <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 border border-emerald-500/20">
      <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
      OpenClaw · {state.runningCount} actif · {state.sessionCount} session(s)
    </span>
  );
}
