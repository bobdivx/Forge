import { useState, useEffect } from 'preact/hooks';

type AuditPayload = {
  ok?: boolean;
  error?: string;
  boundary?: {
    zimaosRuntimeRoles: string[];
    forgeNativeRoles: string[];
    forgeFacades: string[];
  };
  summary?: {
    totalFiles: number;
    filesWithHits: number;
    hitCount: number;
    byPattern: Record<string, number>;
  };
  files?: { path: string; hits: { pattern: string; line: number; text: string }[] }[];
  reviewQueue?: { componentImportsOfGateway: string[]; hint: string };
};

export default function ZimaOSForgeAuditPanel() {
  const [data, setData] = useState<AuditPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Détail technique : répartition par motif + liste des chemins. */
  const [technicalOpen, setTechnicalOpen] = useState(false);

  const run = async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch('/api/zimaos-integration-audit');
      const j = (await r.json()) as AuditPayload;
      if (!r.ok) {
        setErr(j.error || `Erreur ${r.status}`);
        setData(null);
        return;
      }
      setData(j);
    } catch {
      setErr('Erreur réseau');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void run();
  }, []);

  const okComponents = (data?.reviewQueue?.componentImportsOfGateway?.length ?? 0) === 0;

  return (
    <div class="rounded-2xl border border-[#175B37]/20 bg-gradient-to-br from-[#f6faf7] to-white p-5 space-y-4">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-gray-900">Contrôle de frontière Forge / infra</h3>
          <p class="mt-1 text-[11px] text-gray-600 max-w-3xl leading-relaxed">
            Toute la configuration et le pilotage passent par <strong>Forge</strong>. ZimaOS ne sert qu’au{' '}
            <strong>support infra</strong> sur le NAS : fichiers, dossiers d’applications, conteneurs Docker, montages et
            accès SSH. Cet analyseur parcourt le code source pour repérer les références héritées au gateway — sans rien
            lancer en dehors de l’interface.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading}
          class="shrink-0 rounded-full border border-[#175B37]/30 bg-white px-4 py-2 text-xs font-semibold text-[#175B37] shadow-sm hover:bg-[#f6faf7] disabled:opacity-50"
        >
          {loading ? 'Analyse…' : 'Relancer l’analyse'}
        </button>
      </div>

      {err ? (
        <p class="text-xs text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{err}</p>
      ) : null}

      {data?.boundary ? (
        <div class="grid gap-3 sm:grid-cols-2 text-[11px]">
          <div class="rounded-xl border border-gray-100 bg-white/80 p-3">
            <p class="font-bold text-gray-800 mb-2">Géré dans Forge</p>
            <ul class="list-disc pl-4 text-gray-600 space-y-1">
              {data.boundary.forgeNativeRoles.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div class="rounded-xl border border-gray-100 bg-white/80 p-3">
            <p class="font-bold text-gray-800 mb-2">Rôle infra NAS/Docker</p>
            <ul class="list-disc pl-4 text-gray-600 space-y-1">
              {data.boundary.zimaosRuntimeRoles.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
            <p class="mt-2 text-[10px] text-gray-500">
              Façades recommandées :{' '}
              {data.boundary.forgeFacades.map((f) => (
                <code key={f} class="mr-1 rounded bg-gray-50 px-1 font-mono text-[10px]">
                  {f}
                </code>
              ))}
            </p>
          </div>
        </div>
      ) : null}

      {data?.summary ? (
        <div class="flex flex-wrap gap-3 text-xs">
          <span class="rounded-lg bg-white border border-gray-100 px-3 py-2 font-mono text-gray-700">
            Fichiers scannés : <strong>{data.summary.totalFiles}</strong>
          </span>
          <span class="rounded-lg bg-white border border-gray-100 px-3 py-2 font-mono text-gray-700">
            Fichiers avec occurrences : <strong>{data.summary.filesWithHits}</strong>
          </span>
          <span class="rounded-lg bg-white border border-gray-100 px-3 py-2 font-mono text-gray-700">
            Occurrences : <strong>{data.summary.hitCount}</strong>
          </span>
        </div>
      ) : null}

      {data?.reviewQueue ? (
        <div
          class={`rounded-xl border px-3 py-3 text-xs ${
            okComponents ? 'border-emerald-200 bg-emerald-50/80 text-emerald-900' : 'border-amber-200 bg-amber-50/90 text-amber-950'
          }`}
        >
          <p class="font-semibold">{okComponents ? 'Composants UI : conformes' : 'À corriger : imports gateway dans des composants'}</p>
          <p class="mt-1 text-[11px] opacity-90">{data.reviewQueue.hint}</p>
          {!okComponents ? (
            <ul class="mt-2 list-disc pl-4 font-mono text-[10px]">
              {data.reviewQueue.componentImportsOfGateway.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {data?.summary?.byPattern && data.files?.length ? (
        <div>
          <button
            type="button"
            class="text-[11px] font-medium text-[#175B37] underline"
            onClick={() => setTechnicalOpen(!technicalOpen)}
          >
            {technicalOpen ? 'Masquer' : 'Afficher'} le détail technique (motifs + fichiers)
          </button>
          {technicalOpen ? (
            <div class="mt-3 space-y-3">
              <pre class="max-h-40 overflow-auto rounded-lg bg-gray-900/90 p-3 text-[10px] text-emerald-100 font-mono">
                {JSON.stringify(data.summary.byPattern, null, 2)}
              </pre>
              <ul class="max-h-56 overflow-y-auto space-y-1.5 border border-gray-100 rounded-lg p-2 bg-white text-xs">
                {data.files.map((f) => (
                  <li key={f.path} class="font-mono text-[10px] text-gray-700">
                    <span class="text-[#175B37]">{f.path}</span>
                    <span class="text-gray-400"> — {f.hits.length} occ.</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
