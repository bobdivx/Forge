type DashboardServerDef = {
  id: string;
  label: string;
  port: number;
  npmScript: string;
};

type ServerStatus = {
  running: boolean;
  pid: number | null;
  port: number;
  npmScript: string;
};

type Props = {
  server: DashboardServerDef;
  status: ServerStatus | null;
  devLocalBaseUrl?: string;
  npmScripts: string[];
  busy: boolean;
  canRemove: boolean;
  onUpdate: (patch: Partial<DashboardServerDef>) => void;
  onAction: (action: 'start' | 'stop') => void;
  onRemove: () => void;
};

function localDevUrl(base: string | undefined, port: number): string {
  const b = (base || '').replace(/\/$/, '');
  return b ? `${b}:${port}` : `http://localhost:${port}`;
}

export default function AppServerCard({
  server,
  status,
  devLocalBaseUrl,
  npmScripts,
  busy,
  canRemove,
  onUpdate,
  onAction,
  onRemove,
}: Props) {
  const running = status?.running ?? false;
  const url = localDevUrl(devLocalBaseUrl, server.port);

  return (
    <div class="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3">
      <div class="flex flex-col lg:flex-row lg:items-end gap-3">
        <div class="flex-1 grid sm:grid-cols-2 gap-3">
          <div>
            <label class="text-[10px] uppercase text-slate-500 font-bold">Libellé</label>
            <input
              type="text"
              value={server.label}
              onInput={(e) => onUpdate({ label: (e.target as HTMLInputElement).value })}
              class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label class="text-[10px] uppercase text-slate-500 font-bold">Port affiché / accès</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={server.port}
              onInput={(e) => onUpdate({ port: parseInt((e.target as HTMLInputElement).value, 10) || 0 })}
              class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
            />
          </div>
          <div class="sm:col-span-2">
            <label class="text-[10px] uppercase text-slate-500 font-bold">Script npm</label>
            {npmScripts.length > 0 ? (
              <select
                value={server.npmScript}
                onChange={(e) => onUpdate({ npmScript: (e.target as HTMLSelectElement).value })}
                class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
              >
                {!npmScripts.includes(server.npmScript) && (
                  <option value={server.npmScript}>{server.npmScript} (hors package.json)</option>
                )}
                {npmScripts.map((sc) => (
                  <option key={sc} value={sc}>{sc}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={server.npmScript}
                onInput={(e) => onUpdate({ npmScript: (e.target as HTMLInputElement).value })}
                class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
              />
            )}
          </div>
        </div>
        <div class="flex flex-wrap gap-2 lg:pb-0.5">
          <button
            type="button"
            disabled={busy || running}
            onClick={() => onAction('start')}
            class="btn btn-sm bg-emerald-600/90 hover:bg-emerald-600 text-white border-0 disabled:opacity-40"
          >
            Démarrer
          </button>
          <button
            type="button"
            disabled={busy || !running}
            onClick={() => onAction('stop')}
            class="btn btn-sm bg-slate-700 hover:bg-slate-600 text-white border-0 disabled:opacity-40"
          >
            Arrêter
          </button>
          {canRemove && (
            <button type="button" onClick={onRemove} class="btn btn-sm btn-ghost text-red-400">
              Retirer
            </button>
          )}
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span class={running ? 'text-emerald-400 font-semibold' : 'text-slate-500'}>
          {running ? `● En cours (PID ${status?.pid})` : '○ Arrêté'}
        </span>
        <a href={url} target="_blank" rel="noopener noreferrer" class="font-mono text-blue-400 hover:text-blue-300">
          {url}
        </a>
      </div>
    </div>
  );
}
