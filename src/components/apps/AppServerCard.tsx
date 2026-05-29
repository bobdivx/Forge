import { useState } from 'preact/hooks';

type DashboardServerDef = {
  id: string;
  label: string;
  port: number;
  npmScript: string;
  workdir?: string;
  command?: string;
  env?: Record<string, string>;
};

type ForgePortOwner = { folder: string; label: string; pid: number };

type ServerStatus = {
  running: boolean;
  pid: number | null;
  externalProcess?: boolean;
  forgePortOwner?: ForgePortOwner | null;
  port: number;
  npmScript: string;
};

type Props = {
  server: DashboardServerDef;
  status: ServerStatus | null;
  devLocalBaseUrl?: string;
  /** Scripts npm de la racine du projet */
  npmScripts: string[];
  /** Scripts npm du sous-dossier workdir (si différent) */
  workdirScripts?: string[];
  busy: boolean;
  canRemove: boolean;
  onUpdate: (patch: Partial<DashboardServerDef>) => void;
  onAction: (action: 'start' | 'stop') => void;
  onRemove: () => void;
  onViewLogs: () => void;
};

function localDevUrl(base: string | undefined, port: number): string {
  const b = (base || '').replace(/\/$/, '');
  return b ? `${b}:${port}` : `http://localhost:${port}`;
}

const inputCls = 'mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition';
const labelCls = 'text-[10px] uppercase text-gray-400 font-bold';

export default function AppServerCard({
  server,
  status,
  devLocalBaseUrl,
  npmScripts,
  workdirScripts,
  busy,
  canRemove,
  onUpdate,
  onAction,
  onRemove,
  onViewLogs,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const running = status?.running ?? false;
  const url = localDevUrl(devLocalBaseUrl, server.port);

  // Scripts disponibles : ceux du workdir si défini, sinon racine
  const availableScripts = (server.workdir && workdirScripts && workdirScripts.length > 0)
    ? workdirScripts
    : npmScripts;

  return (
    <div class="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
      {/* ── Ligne principale ─────────────────────────────────────────── */}
      <div class="flex flex-col gap-3">
        <div class="flex-1 grid grid-cols-2 gap-3">
          {/* Libellé */}
          <div>
            <label class={labelCls}>Libellé</label>
            <input
              type="text"
              value={server.label}
              onInput={(e) => onUpdate({ label: (e.target as HTMLInputElement).value })}
              class={inputCls}
            />
          </div>
          {/* Port */}
          <div>
            <label class={labelCls}>Port</label>
            <input
              type="number"
              min={1}
              max={65535}
              value={server.port}
              onInput={(e) => onUpdate({ port: parseInt((e.target as HTMLInputElement).value, 10) || 0 })}
              class={`${inputCls} font-mono`}
            />
          </div>
          {/* Script npm / commande */}
          <div class="sm:col-span-2">
            <label class={labelCls}>
              {server.command ? 'Argument de commande' : 'Script npm'}
            </label>
            {!server.command && availableScripts.length > 0 ? (
              <select
                value={server.npmScript}
                onChange={(e) => onUpdate({ npmScript: (e.target as HTMLSelectElement).value })}
                class={`${inputCls} font-mono`}
              >
                {!availableScripts.includes(server.npmScript) && (
                  <option value={server.npmScript}>{server.npmScript} (hors package.json)</option>
                )}
                {availableScripts.map((sc) => (
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

        {/* Boutons action */}
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
          <button
            type="button"
            onClick={onViewLogs}
            title="Voir les logs"
            class="px-3 py-2 rounded-full text-sm font-medium border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors"
          >
            📋
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

      {/* ── Statut + URL ─────────────────────────────────────────────── */}
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        {running ? (
          <span
            class={`font-semibold flex flex-wrap items-center gap-x-1.5 gap-y-0.5 ${status?.externalProcess ? 'text-amber-700' : ''}`}
            style={status?.externalProcess ? undefined : { color: '#3BAE61' }}
          >
            <span
              class={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${status?.externalProcess ? 'bg-amber-500' : 'bg-green-500 animate-pulse'}`}
            />
            {status?.externalProcess ? (
              status.forgePortOwner ? (
                <>
                  Port {server.port} utilisé par « {status.forgePortOwner.label} » (
                  <span class="font-mono">{status.forgePortOwner.folder}</span>, PID {status.forgePortOwner.pid})
                </>
              ) : (
                <>Port {server.port} occupé par un processus externe</>
              )
            ) : (
              <>En cours · PID {status?.pid}</>
            )}
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
        {server.workdir && (
          <span class="font-mono text-gray-400 text-[10px] bg-gray-100 px-1.5 py-0.5 rounded">
            📁 {server.workdir}
          </span>
        )}
        {server.command && (
          <span class="font-mono text-purple-500 text-[10px] bg-purple-50 px-1.5 py-0.5 rounded">
            $ {server.command}
          </span>
        )}
      </div>

      {/* ── Options avancées ─────────────────────────────────────────── */}
      <div class="border-t border-gray-100 pt-2">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          class="text-[10px] text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
        >
          <span class={`transition-transform ${showAdvanced ? 'rotate-90' : ''}`}>▶</span>
          Options avancées (sous-dossier, commande custom)
        </button>

        {showAdvanced && (
          <div class="mt-3 grid sm:grid-cols-2 gap-3">
            {/* Workdir */}
            <div>
              <label class={labelCls}>Sous-dossier (workdir)</label>
              <input
                type="text"
                value={server.workdir ?? ''}
                placeholder="ex: backend, packages/api"
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  onUpdate({ workdir: v || undefined });
                }}
                class={`${inputCls} font-mono`}
              />
              <p class="text-[10px] text-gray-400 mt-1">Chemin relatif depuis la racine du projet</p>
            </div>

            {/* Commande custom */}
            <div>
              <label class={labelCls}>Commande custom</label>
              <input
                type="text"
                value={server.command ?? ''}
                placeholder="ex: python, go, node, pnpm"
                onInput={(e) => {
                  const v = (e.target as HTMLInputElement).value.trim();
                  onUpdate({ command: v || undefined });
                }}
                class={`${inputCls} font-mono`}
              />
              <p class="text-[10px] text-gray-400 mt-1">Remplace npm. L'argument sera le script ci-dessus.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
