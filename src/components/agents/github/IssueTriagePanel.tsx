import { useEffect, useState } from 'preact/hooks';

type Issue = {
  number: number;
  title: string;
  state: string;
  labels?: Array<{ name: string }>;
  user?: { login: string };
  html_url?: string;
};

type ProjectRow = {
  id: number;
  name: string;
};

export default function IssueTriagePanel() {
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        const list = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
        setProjects(list.map((p: { id: number; name: string }) => ({ id: p.id, name: p.name })));
        if (list[0]?.id) setSelectedId(list[0].id);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (selectedId == null) return;
    setLoading(true);
    // Endpoint d'aide : on essaie d'abord /api/projects/[id]/issues si existe, sinon vide.
    fetch(`/api/projects/${selectedId}/issues`)
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((data) => {
        const list = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : [];
        setIssues(list);
      })
      .catch(() => setIssues([]))
      .finally(() => setLoading(false));
  }, [selectedId]);

  return (
    <section class="bg-white rounded-[1.5rem] border border-gray-100 shadow-sm overflow-hidden">
      <header class="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
        <div class="w-1 h-6 rounded-full bg-[#3BAE61]" />
        <h2 class="text-base font-bold text-gray-900">Issues entrantes</h2>
        <select
          class="ml-auto text-xs border border-gray-200 rounded-full px-3 py-1 bg-white"
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(Number((e.target as HTMLSelectElement).value) || null)}
        >
          {projects.length === 0 && <option value="">Aucun projet</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </header>
      {loading ? (
        <div class="p-8 text-center text-sm text-gray-400">Chargement…</div>
      ) : issues.length === 0 ? (
        <div class="p-8 text-center text-sm text-gray-400">
          Pas d'issue ouverte pour ce projet (ou endpoint non disponible).
        </div>
      ) : (
        <div class="divide-y divide-gray-100">
          {issues.slice(0, 20).map((issue) => (
            <div key={issue.number} class="px-6 py-3 hover:bg-gray-50 transition-colors">
              <div class="flex items-start gap-3">
                <span class="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase border bg-emerald-50 text-emerald-700 border-emerald-200">
                  Issue
                </span>
                <div class="flex-1 min-w-0">
                  <a href={issue.html_url} target="_blank" rel="noopener noreferrer" class="text-sm font-semibold text-gray-900 hover:underline truncate block">
                    #{issue.number} · {issue.title}
                  </a>
                  <div class="text-xs text-gray-500 mt-1">
                    @{issue.user?.login || 'inconnu'} · {(issue.labels || []).map((l) => l.name).join(', ') || 'aucun label'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
