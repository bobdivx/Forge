type DashboardServerDef = {
  id: string;
  label: string;
  port: number;
  npmScript: string;
};

type ServerStatus = {
  running: boolean;
  pid: number | null;
  externalProcess?: boolean;
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

const inputCls = 'mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition';

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
    <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      <div class="flex flex-col lg:flex-row lg:items-end gap-3">
        <div class="flex-1 grid sm:grid-cols-2 gap-3">
          <div>
            <label class="text-[10px] uppercase text-gray-400 font-bold">Libellé</label>
            <input
              type="text"
              value={server.label}
              onInput={(e) => onUpdate({ label: (e.target as HTMLInputElement).value })}
              class={inputCls}
            />
          </div>
          <div>
            <label class="text-[10px] uppercase text-gray-400 font-bold">Port affiché / accès</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={server.port}
              onInput={(e) => onUpdate({ port: parseInt((e.target as HTMLInputElement).value, 10) || 0 })}
              class={`${inputCls} font-mono`}
            />
          </div>
          <div class="sm:col-span-2">
            <label class="text-[10px] uppercase text-gray-400 font-bold">Script npm</label>
            {npmScripts.length > 0 ? (
              <select
                value={server.npmScript}
                onChange={(e) => onUpdate({ npmScript: (e.target as HTMLSelectElement).value })}
                class={`${inputCls} font-mono`}
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
                class={`${inputCls} font-mono`}
              />
            )}
          </div>
        </div>
        <div class="flex flex-wrap gap-2 lg:pb-0.5">
          <button
            type="button"
            disabled={busy || running}
            onClick={() => onAction('start')}
            class="px-4 py-2 rounded-full text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style="background:#3BAE61"
          >
            Démarrer
          </button>
          <button
            type="button"
            disabled={busy || !running}
            onClick={() => onAction('stop')}
            class="px-4 py-2 rounded-full text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-100 transition-colors disabled:opacity-40"
          >
            Arrêter
          </button>
          {canRemove && (
            <button
              type="button"
              onClick={onRemove}
              class="px-4 py-2 rounded-full text-sm font-medium text-red-500 hover:text-red-600 hover:underline transition-colors"
            >
              Retirer
            </button>
          )}
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {running ? (
          <span class="font-semibold flex items-center gap-1.5" style="color:#3BAE61">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            {status?.externalProcess
              ? `En cours · port ${server.port} (processus externe)`
              : `En cours · PID ${status?.pid}`}
          </span>
        ) : (
          <span class="text-gray-400 flex items-center gap-1.5">
            <span class="inline-block w-1.5 h-1.5 rounded-full bg-gray-300" />
            Arrêté
          </span>
        )}
        <a href={url} target="_blank" rel="noopener noreferrer" class="font-mono text-blue-500 hover:underline">
          {url}
        </a>
      </div>
    </div>
  );
}
