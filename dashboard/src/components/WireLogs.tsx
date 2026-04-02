import { useEffect, useState } from 'preact/hooks';

export default function WireLogs() {
  const [lines, setLines] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      fetch('/api/openclaw-activity')
        .then((res) => res.json())
        .then((data) => {
          if (cancelled) return;
          if (data.lines && Array.isArray(data.lines)) {
            setLines(data.lines);
            setErr(null);
          } else {
            setLines([]);
            setErr('Réponse inattendue');
          }
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) {
            setErr('Flux indisponible');
            setLoading(false);
          }
        });
    };

    load();
    const t = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const display = loading && lines.length === 0 ? ['[OPENCLAW] Chargement des sessions…'] : lines;

  return (
    <div class="bg-slate-950 rounded-xl border border-slate-800 shadow-xl overflow-hidden flex flex-col h-[300px]">
      <div class="flex items-center justify-between px-4 py-2.5 bg-slate-900 border-b border-slate-800">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h2 class="text-xs font-semibold tracking-wider text-slate-300 uppercase">The Wire — OpenClaw (réel)</h2>
        </div>
        {err && <span class="text-[10px] text-amber-500/90">{err}</span>}
      </div>

      <div class="flex-1 p-4 font-mono text-[11px] overflow-y-auto bg-[#0A0D14] text-slate-300 custom-scrollbar flex flex-col gap-1.5">
        {display.map((line, i) => {
          let colorClass = 'text-slate-400';
          if (line.includes('[OPENCLAW]')) colorClass = 'text-blue-400';
          if (line.includes('actif')) colorClass = 'text-emerald-400';
          if (line.includes('veille')) colorClass = 'text-slate-500';
          if (line.includes('erreur')) colorClass = 'text-red-400';

          return (
            <div key={i} class="flex items-start gap-3 hover:bg-slate-800/50 px-2 py-0.5 rounded transition">
              <span class="text-slate-600 shrink-0 select-none">
                {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span class={`${colorClass} break-words`}>{line}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
