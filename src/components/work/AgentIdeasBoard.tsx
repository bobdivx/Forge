import { useCallback, useEffect, useState } from 'preact/hooks';

type Idea = {
  id: number;
  projectId: number;
  title: string;
  content: string | null;
  status: string;
  priority: string;
  author: string;
  requestType: string | null;
  assigneeAgentId: string | null;
  createdAt: string;
};

export default function AgentIdeasBoard() {
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(() => {
    fetch('/api/work-overview')
      .then((r) => r.json())
      .then((d) => {
        if (d?.agentIdeas) setIdeas(d.agentIdeas as Idea[]);
      })
      .catch(() => setIdeas([]));
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 20_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function setStatus(id: number, status: 'completed' | 'rejected') {
    setBusy(id);
    try {
      const res = await fetch('/api/agent-proposals', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Erreur ${res.status}`);
      }
      load();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (!ideas.length) {
    return (
      <div class="rounded-[1.5rem] border border-dashed border-gray-200 bg-white/50 p-8 text-center text-sm text-gray-400">
        Aucune idée ou amélioration proposée par les agents pour l’instant.
      </div>
    );
  }

  return (
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {ideas.map((idea) => (
        <div
          key={idea.id}
          class="relative bg-gradient-to-br from-amber-50/90 to-white rounded-[1.25rem] border border-amber-100 shadow-sm p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200"
        >
          <div class="absolute top-3 right-3 flex gap-1">
            <button
              type="button"
              disabled={busy === idea.id}
              onClick={() => setStatus(idea.id, 'completed')}
              class="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40"
              title="Valider"
            >
              ✓
            </button>
            <button
              type="button"
              disabled={busy === idea.id}
              onClick={() => setStatus(idea.id, 'rejected')}
              class="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
              title="Rejeter"
            >
              ✗
            </button>
          </div>
          <p class="text-[10px] font-bold uppercase tracking-widest text-amber-700/80 pr-16">{idea.requestType || 'Idée'}</p>
          <h4 class="text-sm font-bold text-gray-900 mt-1 pr-14 line-clamp-2">{idea.title}</h4>
          {idea.content ? (
            <p class="text-xs text-gray-600 mt-2 line-clamp-4 whitespace-pre-wrap">{idea.content}</p>
          ) : null}
          <div class="mt-3 flex flex-wrap gap-2 text-[10px] text-gray-500">
            <span class="font-mono text-[#175B37]">{idea.author}</span>
            <span>·</span>
            <span>P{idea.projectId}</span>
            <span>·</span>
            <span>{idea.priority}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
