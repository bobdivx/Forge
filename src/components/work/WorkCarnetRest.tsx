import { useCallback, useEffect, useState } from 'preact/hooks';

type Req = {
  id: number;
  projectName: string;
  title: string;
  status: string;
  requestType: string | null;
  author: string;
  createdAt: string;
};

type Dep = {
  id: number;
  projectName: string;
  packageName: string;
  versionSpec: string | null;
  status: string;
  requestedByAgentId: string;
  createdAt: string;
};

export default function WorkCarnetRest() {
  const [requests, setRequests] = useState<Req[]>([]);
  const [deps, setDeps] = useState<Dep[]>([]);

  const load = useCallback(() => {
    fetch('/api/work-overview')
      .then((r) => r.json())
      .then((d) => {
        if (d?.requests) setRequests(d.requests);
        if (d?.dependencies) setDeps(d.dependencies);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 25_000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <div class="grid grid-cols-1 xl:grid-cols-2 gap-8">
      <section class="space-y-3">
        <div class="flex items-center gap-3 flex-wrap">
          <div class="w-1 h-6 rounded-full bg-yellow-400"></div>
          <h3 class="text-base font-bold text-gray-900">Demandes &amp; fonctionnalités</h3>
          <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{requests.length}</span>
          <div class="flex-1" />
          <button
            type="button"
            disabled={requests.filter((r) => r.status === 'pending' || r.status === 'in_progress').length === 0}
            onClick={() =>
              window.__deleteWorkItems?.(
                'request',
                'active',
                requests.filter((r) => r.status === 'pending' || r.status === 'in_progress').length,
                'demandes en attente',
              )
            }
            class="text-xs font-medium px-3 py-1.5 rounded-full border border-amber-200 text-amber-700 hover:bg-amber-50 disabled:opacity-40"
          >
            Supprimer lot (actives)
          </button>
          <button
            type="button"
            onClick={() => window.__openWorkModal?.('request')}
            class="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm"
            style="background:#175B37"
            title="Nouvelle demande"
          >
            +
          </button>
        </div>
        <div class="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {requests.length === 0 ? (
            <p class="text-sm text-gray-400 py-6 text-center">Aucune demande.</p>
          ) : (
            requests.map((r) => (
              <button
                type="button"
                key={r.id}
                onClick={() => window.__openWorkDetail?.('request', r.id)}
                class="w-full text-left bg-white rounded-xl border border-gray-100 p-4 hover:border-amber-200 transition-colors"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-50 text-gray-600">{r.status}</span>
                  <span class="text-[10px] text-gray-400">{r.projectName}</span>
                </div>
                <p class="text-sm font-medium text-gray-900 mt-1 line-clamp-2">{r.title}</p>
                <p class="text-[10px] text-gray-400 mt-1 font-mono">{r.author}</p>
              </button>
            ))
          )}
        </div>
      </section>

      <section class="space-y-3">
        <div class="flex items-center gap-3 flex-wrap">
          <div class="w-1 h-6 rounded-full bg-blue-400"></div>
          <h3 class="text-base font-bold text-gray-900">Dépendances</h3>
          <span class="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-medium">{deps.length}</span>
          <div class="flex-1" />
          <button
            type="button"
            disabled={deps.filter((d) => d.status === 'open' || d.status === 'in_progress').length === 0}
            onClick={() =>
              window.__deleteWorkItems?.(
                'dep',
                'active',
                deps.filter((d) => d.status === 'open' || d.status === 'in_progress').length,
                'dépendances ouvertes',
              )
            }
            class="text-xs font-medium px-3 py-1.5 rounded-full border border-blue-200 text-blue-600 hover:bg-blue-50 disabled:opacity-40"
          >
            Supprimer lot (actives)
          </button>
          <button
            type="button"
            onClick={() => window.__openWorkModal?.('dep')}
            class="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-sm"
            style="background:#3B82F6"
            title="Nouvelle dépendance"
          >
            +
          </button>
        </div>
        <div class="space-y-2 max-h-[420px] overflow-y-auto pr-1">
          {deps.length === 0 ? (
            <p class="text-sm text-gray-400 py-6 text-center">Aucune dépendance.</p>
          ) : (
            deps.map((d) => (
              <button
                type="button"
                key={d.id}
                onClick={() => window.__openWorkDetail?.('dep', d.id)}
                class="w-full text-left bg-white rounded-xl border border-gray-100 p-4 hover:border-blue-200 transition-colors"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-gray-50 text-gray-600">{d.status}</span>
                  <span class="text-[10px] text-gray-400">{d.projectName}</span>
                </div>
                <p class="text-sm font-mono text-blue-600 mt-1">
                  {d.packageName}
                  {d.versionSpec ? `@${d.versionSpec}` : ''}
                </p>
                <p class="text-[10px] text-gray-400 mt-1 font-mono">{d.requestedByAgentId}</p>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

declare global {
  interface Window {
    __openWorkModal?: (type: string) => void;
    __deleteWorkItems?: (itemType: string, scope: string, count: number, label: string) => void;
    __openWorkDetail?: (type: string, id: number) => void;
  }
}
