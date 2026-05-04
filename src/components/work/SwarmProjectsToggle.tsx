import { useCallback, useEffect, useState } from 'preact/hooks';

export default function SwarmProjectsToggle() {
  const [swarmCount, setSwarmCount] = useState<number | null>(null);
  const [total, setTotal] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    fetch('/api/work-overview')
      .then((r) => r.json())
      .then((d) => {
        if (d?.projects) {
          setTotal(d.projects.length);
          setSwarmCount(d.projects.filter((p: { swarmEnabled?: boolean }) => p.swarmEnabled).length);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function setAll(on: boolean) {
    setBusy(true);
    try {
      const res = await fetch('/api/projects-swarm-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ swarmEnabled: on }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `Erreur ${res.status}`);
      refresh();
      window.location.reload();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="flex flex-wrap items-center gap-3 bg-[#E9F3EB]/80 border border-[#175B37]/20 rounded-[1.25rem] px-4 py-3">
      <span class="text-sm font-medium text-gray-800">
        Projets swarm :{' '}
        <strong class="text-[#175B37]">
          {swarmCount ?? '—'}/{total ?? '—'}
        </strong>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => setAll(true)}
        class="text-xs font-semibold px-3 py-1.5 rounded-full bg-[#175B37] text-white hover:opacity-90 disabled:opacity-40"
      >
        Tout activer
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setAll(false)}
        class="text-xs font-semibold px-3 py-1.5 rounded-full border border-gray-300 text-gray-700 hover:bg-white disabled:opacity-40"
      >
        Tout désactiver
      </button>
    </div>
  );
}
