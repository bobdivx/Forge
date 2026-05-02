import { useState, useEffect, useRef } from 'preact/hooks';

type ModelRow = { id: string; name: string };

interface Props {
  agentId: string;
  initialModel: string;
  /** Agent principal : propage aux sous-agents `__APP_`. Fiche sous-agent : false. */
  cascadeToSubagents: boolean;
  subagentCount: number;
}

function normalizeModels(data: unknown): ModelRow[] {
  if (!Array.isArray(data)) return [];
  const out: ModelRow[] = [];
  const seen = new Set<string>();
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const r = raw as Record<string, unknown>;
    const id = String(r.id ?? r.name ?? '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: String(r.name ?? r.id ?? id).trim() || id,
    });
  }
  return out;
}

export default function AgentSwarmModelPicker({
  agentId,
  initialModel,
  cascadeToSubagents,
  subagentCount,
}: Props) {
  const [models, setModels] = useState<ModelRow[]>([]);
  const [value, setValue] = useState(initialModel);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestRef = useRef(initialModel);

  useEffect(() => {
    setValue(initialModel);
    latestRef.current = initialModel;
  }, [initialModel]);

  useEffect(() => {
    const seed = initialModel;
    fetch('/api/models?filter=active')
      .then((res) => res.json())
      .then((data) => {
        let list = normalizeModels(data);
        if (seed && !list.some((m) => m.id === seed)) {
          list = [{ id: seed, name: seed }, ...list];
        }
        setModels(list);
      })
      .catch(() => setModels([]));
  }, [initialModel]);

  const apply = async (model: string) => {
    const m = model.trim();
    if (!m) return;
    if (m === latestRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/agent-model-cascade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agentId.trim(),
          model: m,
          cascadeToSubagents,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        results?: { agentId: string; ok: boolean; error?: string }[];
      };
      if (!res.ok || !data.ok) {
        const firstErr = data.results?.find((r) => !r.ok)?.error;
        setError(firstErr || data.error || 'Enregistrement impossible');
        setValue(latestRef.current);
        return;
      }
      latestRef.current = m;
      setValue(m);
      window.location.reload();
    } catch {
      setError('Erreur réseau');
      setValue(latestRef.current);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div class="rounded-[1.5rem] border border-[#175B37]/20 bg-white p-4 shadow-sm ring-1 ring-[#175B37]/10">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div class="min-w-0 flex-1">
          <p class="text-[10px] font-bold uppercase tracking-wider text-gray-400">Modèle LLM</p>
          <p class="mt-0.5 text-[11px] text-gray-600">
            {cascadeToSubagents
              ? subagentCount > 0
                ? `Appliqué immédiatement à cet agent et à ${subagentCount} sous-agent(s) projet.`
                : 'Appliqué immédiatement à cet agent (sous-agents inclus s’il y en a).'
              : 'Appliqué immédiatement à ce sous-agent.'}
          </p>
        </div>
        <div class="flex w-full items-center gap-2 sm:w-auto sm:min-w-[220px]">
          <select
            disabled={busy}
            class="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm font-semibold text-gray-900 outline-none focus:border-[#175B37]/50 focus:bg-white disabled:opacity-60"
            value={value}
            onChange={(e) => {
              const v = (e.target as HTMLSelectElement).value;
              setValue(v);
              void apply(v);
            }}
          >
            {!value ? <option value="">— Choisir un modèle —</option> : null}
            {value && !models.some((x) => x.id === value) ? <option value={value}>{value}</option> : null}
            {models.map((m, i) => (
              <option key={`${m.id}:${i}`} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {busy ? (
            <span
              class="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#175B37]/25 border-t-[#175B37]"
              aria-hidden
            />
          ) : null}
        </div>
      </div>
      {error ? (
        <p class="mt-2 text-xs text-red-600 border-t border-red-100 pt-2">{error}</p>
      ) : null}
    </div>
  );
}
