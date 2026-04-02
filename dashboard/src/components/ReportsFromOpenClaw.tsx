import { useEffect, useState } from 'preact/hooks';

type Report = { title: string; subtitle: string; body: string; source: string };

export default function ReportsFromOpenClaw() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/openclaw-reports')
      .then((r) => r.json())
      .then((d) => {
        setReports(Array.isArray(d.reports) ? d.reports : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <p class="text-slate-500 animate-pulse py-12 text-center">Chargement des rapports…</p>;
  }

  if (reports.length === 0) {
    return <p class="text-slate-500">Aucun contenu.</p>;
  }

  return (
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {reports.map((rep, i) => (
        <div class="bg-slate-900 border border-slate-800 rounded-xl p-6" key={`${rep.title}-${i}`}>
          <div class="flex justify-between items-center mb-4 pb-4 border-b border-slate-800">
            <h3 class="font-bold text-white">{rep.title}</h3>
            <span class="text-xs text-slate-500">{rep.source}</span>
          </div>
          <p class="text-[10px] text-slate-600 font-mono mb-3 break-all">{rep.subtitle}</p>
          <div class="prose prose-invert prose-sm max-w-none text-slate-300 font-mono text-xs whitespace-pre-wrap">
            {rep.body}
          </div>
        </div>
      ))}
    </div>
  );
}
