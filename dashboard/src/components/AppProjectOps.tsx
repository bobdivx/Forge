import { useCallback, useEffect, useState } from 'preact/hooks';

type DashboardServerDef = {
  id: string;
  label: string;
  port: number;
  npmScript: string;
};

type ForgeAppDashboardConfig = {
  testUrl?: string;
  prodUrl?: string;
  devLocalBaseUrl?: string;
  servers?: DashboardServerDef[];
};

type ServerStatus = {
  running: boolean;
  pid: number | null;
  port: number;
  npmScript: string;
};

function localDevUrl(base: string | undefined, port: number): string {
  const b = (base || '').replace(/\/$/, '');
  if (b) return `${b}:${port}`;
  return `http://localhost:${port}`;
}

function newServerId(): string {
  return `srv-${Date.now().toString(36)}`;
}

export default function AppProjectOps({
  appName,
  forgeVirtualHost,
}: {
  appName: string;
  forgeVirtualHost: string;
}) {
  const apiBase = `/api/projects/${encodeURIComponent(appName)}`;
  const [config, setConfig] = useState<ForgeAppDashboardConfig | null>(null);
  const [npmScripts, setNpmScripts] = useState<string[]>([]);
  const [packageName, setPackageName] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [statuses, setStatuses] = useState<Record<string, ServerStatus | null>>({});
  const [busyServer, setBusyServer] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMsg(null);
    try {
      const res = await fetch(`${apiBase}/dashboard-config`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Chargement impossible');
      setConfig(data.config || {});
      setNpmScripts(Array.isArray(data.npmScripts) ? data.npmScripts : []);
      setPackageName(data.packageName);
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Erreur réseau' });
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshStatuses = useCallback(async () => {
    const srvs = config?.servers || [];
    const next: Record<string, ServerStatus | null> = {};
    await Promise.all(
      srvs.map(async (s) => {
        try {
          const res = await fetch(`${apiBase}/dev-server`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'status', serverId: s.id }),
          });
          const data = await res.json();
          if (res.ok) {
            next[s.id] = {
              running: Boolean(data.running),
              pid: data.pid ?? null,
              port: data.port,
              npmScript: data.npmScript,
            };
          } else {
            next[s.id] = null;
          }
        } catch {
          next[s.id] = null;
        }
      })
    );
    setStatuses(next);
  }, [apiBase, config?.servers]);

  useEffect(() => {
    if (!config?.servers?.length) return;
    refreshStatuses();
    const t = setInterval(refreshStatuses, 8000);
    return () => clearInterval(t);
  }, [config?.servers, refreshStatuses]);

  const saveMeta = async () => {
    if (!config) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch(`${apiBase}/dashboard-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testUrl: config.testUrl || '',
          prodUrl: config.prodUrl || '',
          devLocalBaseUrl: config.devLocalBaseUrl || '',
          servers: config.servers,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sauvegarde refusée');
      setConfig(data.config);
      setMsg({ type: 'ok', text: 'Enregistré dans .forge/app-dashboard.json' });
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Erreur réseau' });
    } finally {
      setSaving(false);
    }
  };

  const devAction = async (serverId: string, action: 'start' | 'stop') => {
    setBusyServer(serverId);
    setMsg(null);
    try {
      const res = await fetch(`${apiBase}/dev-server`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, serverId }),
      });
      const data = await res.json();
      if (!res.ok && res.status !== 409) {
        throw new Error(data.error || 'Action refusée');
      }
      if (res.status === 409) {
        setMsg({ type: 'ok', text: 'Processus déjà actif (voir PID).' });
      } else if (action === 'start') {
        setMsg({ type: 'ok', text: `npm run ${data.npmScript || '?'} démarré (PID ${data.pid}).` });
      } else {
        setMsg({ type: 'ok', text: 'Arrêt demandé.' });
      }
      await refreshStatuses();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Erreur réseau' });
    } finally {
      setBusyServer(null);
    }
  };

  const updateServer = (id: string, patch: Partial<DashboardServerDef>) => {
    setConfig((c) => {
      if (!c?.servers) return c;
      return {
        ...c,
        servers: c.servers.map((s) => (s.id === id ? { ...s, ...patch } : s)),
      };
    });
  };

  const addServer = () => {
    setConfig((c) => {
      const scripts = npmScripts.length ? npmScripts : ['dev'];
      const script = scripts.includes('dev') ? 'dev' : scripts[0];
      const next: DashboardServerDef = {
        id: newServerId(),
        label: 'Nouveau serveur',
        port: 3000,
        npmScript: script,
      };
      return {
        ...(c || {}),
        servers: [...(c?.servers || []), next],
      };
    });
  };

  const removeServer = (id: string) => {
    setConfig((c) => {
      if (!c?.servers || c.servers.length <= 1) return c;
      return { ...c, servers: c.servers.filter((s) => s.id !== id) };
    });
  };

  if (loading && !config) {
    return (
      <section class="bg-slate-900 border border-slate-800 rounded-xl p-6 animate-pulse">
        <div class="h-4 bg-slate-800 rounded w-1/3 mb-4" />
        <div class="h-24 bg-slate-800/80 rounded" />
      </section>
    );
  }

  if (!config) {
    return (
      <section class="bg-slate-900 border border-red-500/20 rounded-xl p-6 text-sm text-red-300">
        Impossible de charger la configuration projet.
      </section>
    );
  }

  const servers = config.servers || [];
  const forgeUrl = `http://${forgeVirtualHost}`;

  return (
    <section class="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold text-white">Projet &amp; déploiements</h3>
          <p class="text-xs text-slate-500 mt-1">
            Identifiant route :{' '}
            <span class="font-mono text-slate-400">{encodeURIComponent(appName)}</span>
            {packageName && (
              <>
                {' '}
                · package <span class="font-mono text-blue-400/90">{packageName}</span>
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          class="btn btn-ghost btn-sm text-slate-400 hover:text-white shrink-0"
        >
          Recharger
        </button>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-2">
          <h4 class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Hôte Forge (local)</h4>
          <a
            href={forgeUrl}
            target="_blank"
            rel="noopener noreferrer"
            class="text-sm text-blue-400 hover:text-blue-300 font-mono break-all"
          >
            {forgeUrl}
          </a>
          <p class="text-[11px] text-slate-500">Nom DNS interne type ZimaOS / reverse proxy.</p>
        </div>
        <div class="rounded-lg border border-slate-800 bg-slate-950/50 p-4 space-y-2">
          <h4 class="text-[10px] font-bold uppercase tracking-widest text-slate-500">Base URL dev (optionnel)</h4>
          <input
            type="text"
            value={config.devLocalBaseUrl || ''}
            onInput={(e) =>
              setConfig({
                ...config,
                devLocalBaseUrl: (e.target as HTMLInputElement).value,
              })
            }
            placeholder="http://localhost"
            class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 outline-none font-mono"
          />
          <p class="text-[11px] text-slate-500">
            Les URL dev par serveur seront <span class="font-mono">base:port</span> (ex. http://127.0.0.1:4321 si vide).
          </p>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            URL site de test (staging / preview)
          </label>
          <input
            type="url"
            value={config.testUrl || ''}
            onInput={(e) =>
              setConfig({ ...config, testUrl: (e.target as HTMLInputElement).value })
            }
            placeholder="https://preview.vercel.app"
            class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 outline-none"
          />
        </div>
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-2">
            URL production
          </label>
          <input
            type="url"
            value={config.prodUrl || ''}
            onInput={(e) =>
              setConfig({ ...config, prodUrl: (e.target as HTMLInputElement).value })
            }
            placeholder="https://www.example.com"
            class="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-blue-500 outline-none"
          />
        </div>
      </div>

      <div class="flex flex-wrap gap-3 items-center">
        {(config.testUrl || '').trim() !== '' && (
          <a
            href={(config.testUrl || '').trim()}
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-outline border-slate-600 text-slate-200"
          >
            Ouvrir test
          </a>
        )}
        {(config.prodUrl || '').trim() !== '' && (
          <a
            href={(config.prodUrl || '').trim()}
            target="_blank"
            rel="noopener noreferrer"
            class="btn btn-sm btn-outline border-emerald-500/30 text-emerald-300"
          >
            Ouvrir prod
          </a>
        )}
        <button
          type="button"
          onClick={() => saveMeta()}
          disabled={saving}
          class="btn btn-sm bg-blue-600 hover:bg-blue-500 text-white border-0"
        >
          {saving ? 'Enregistrement…' : 'Enregistrer URLs & serveurs'}
        </button>
      </div>

      <div class="border-t border-slate-800 pt-6 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h4 class="text-sm font-semibold text-white">Serveurs de développement</h4>
          <button
            type="button"
            onClick={() => addServer()}
            disabled={servers.length >= 8}
            class="btn btn-ghost btn-xs text-blue-400"
          >
            + Ajouter un serveur
          </button>
        </div>
        <p class="text-xs text-slate-500">
          Lance <span class="font-mono text-slate-400">npm run &lt;script&gt;</span> sur le disque du projet (machine
          qui héberge le dashboard). Les journaux :{' '}
          <span class="font-mono text-slate-600">.forge/dev-pids/*.log</span>.
        </p>

        <div class="space-y-4">
          {servers.map((s) => {
            const st = statuses[s.id];
            const url = localDevUrl(config.devLocalBaseUrl, s.port);
            const running = st?.running ?? false;
            return (
              <div
                key={s.id}
                class="rounded-xl border border-slate-800 bg-slate-950/40 p-4 space-y-3"
              >
                <div class="flex flex-col lg:flex-row lg:items-end gap-3">
                  <div class="flex-1 grid sm:grid-cols-2 gap-3">
                    <div>
                      <label class="text-[10px] uppercase text-slate-500 font-bold">Libellé</label>
                      <input
                        type="text"
                        value={s.label}
                        onInput={(e) =>
                          updateServer(s.id, { label: (e.target as HTMLInputElement).value })
                        }
                        class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label class="text-[10px] uppercase text-slate-500 font-bold">Port affiché / accès</label>
                      <input
                        type="number"
                        min={1}
                        max={65535}
                        value={s.port}
                        onInput={(e) =>
                          updateServer(s.id, {
                            port: parseInt((e.target as HTMLInputElement).value, 10) || 0,
                          })
                        }
                        class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                      />
                    </div>
                    <div class="sm:col-span-2">
                      <label class="text-[10px] uppercase text-slate-500 font-bold">Script npm</label>
                      {npmScripts.length > 0 ? (
                        <select
                          value={s.npmScript}
                          onChange={(e) =>
                            updateServer(s.id, {
                              npmScript: (e.target as HTMLSelectElement).value,
                            })
                          }
                          class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                        >
                          {!npmScripts.includes(s.npmScript) && (
                            <option value={s.npmScript}>{s.npmScript} (hors package.json)</option>
                          )}
                          {npmScripts.map((sc) => (
                            <option key={sc} value={sc}>
                              {sc}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type="text"
                          value={s.npmScript}
                          onInput={(e) =>
                            updateServer(s.id, { npmScript: (e.target as HTMLInputElement).value })
                          }
                          class="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono"
                        />
                      )}
                    </div>
                  </div>
                  <div class="flex flex-wrap gap-2 lg:pb-0.5">
                    <button
                      type="button"
                      disabled={busyServer === s.id || running}
                      onClick={() => devAction(s.id, 'start')}
                      class="btn btn-sm bg-emerald-600/90 hover:bg-emerald-600 text-white border-0 disabled:opacity-40"
                    >
                      Démarrer
                    </button>
                    <button
                      type="button"
                      disabled={busyServer === s.id || !running}
                      onClick={() => devAction(s.id, 'stop')}
                      class="btn btn-sm bg-slate-700 hover:bg-slate-600 text-white border-0 disabled:opacity-40"
                    >
                      Arrêter
                    </button>
                    {servers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeServer(s.id)}
                        class="btn btn-sm btn-ghost text-red-400"
                      >
                        Retirer
                      </button>
                    )}
                  </div>
                </div>
                <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                  <span
                    class={
                      running
                        ? 'text-emerald-400 font-semibold'
                        : 'text-slate-500'
                    }
                  >
                    {running ? `● En cours (PID ${st?.pid})` : '○ Arrêté'}
                  </span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="font-mono text-blue-400 hover:text-blue-300"
                  >
                    {url}
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {msg && (
        <div
          class={`text-xs p-3 rounded-lg border ${
            msg.type === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
              : 'bg-red-500/10 border-red-500/30 text-red-200'
          }`}
        >
          {msg.text}
        </div>
      )}
    </section>
  );
}
