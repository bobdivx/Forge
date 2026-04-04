import { useCallback, useEffect, useState } from 'preact/hooks';
import AppUrlsForm from './AppUrlsForm';
import AppServerCard from './AppServerCard';

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

function newServerId(): string {
  return `srv-${Date.now().toString(36)}`;
}

type Props = {
  appName: string;
  forgeVirtualHost: string;
};

export default function AppProjectOps({ appName, forgeVirtualHost }: Props) {
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

  useEffect(() => { load(); }, [load]);

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
          next[s.id] = res.ok ? { running: Boolean(data.running), pid: data.pid ?? null, port: data.port, npmScript: data.npmScript } : null;
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
        body: JSON.stringify({ testUrl: config.testUrl || '', prodUrl: config.prodUrl || '', devLocalBaseUrl: config.devLocalBaseUrl || '', servers: config.servers }),
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
      if (!res.ok && res.status !== 409) throw new Error(data.error || 'Action refusée');
      if (res.status === 409) setMsg({ type: 'ok', text: 'Processus déjà actif (voir PID).' });
      else if (action === 'start') setMsg({ type: 'ok', text: `npm run ${data.npmScript || '?'} démarré (PID ${data.pid}).` });
      else setMsg({ type: 'ok', text: 'Arrêt demandé.' });
      await refreshStatuses();
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Erreur réseau' });
    } finally {
      setBusyServer(null);
    }
  };

  const updateServer = (id: string, patch: Partial<DashboardServerDef>) => {
    setConfig((c) => !c?.servers ? c : { ...c, servers: c.servers.map((s) => s.id === id ? { ...s, ...patch } : s) });
  };

  const addServer = () => {
    setConfig((c) => {
      const scripts = npmScripts.length ? npmScripts : ['dev'];
      const next: DashboardServerDef = { id: newServerId(), label: 'Nouveau serveur', port: 3000, npmScript: scripts.includes('dev') ? 'dev' : scripts[0] };
      return { ...(c || {}), servers: [...(c?.servers || []), next] };
    });
  };

  const removeServer = (id: string) => {
    setConfig((c) => !c?.servers || c.servers.length <= 1 ? c : { ...c, servers: c.servers.filter((s) => s.id !== id) });
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
    return <section class="bg-slate-900 border border-red-500/20 rounded-xl p-6 text-sm text-red-300">Impossible de charger la configuration projet.</section>;
  }

  const servers = config.servers || [];

  return (
    <section class="bg-slate-900 border border-slate-800 rounded-xl p-6 space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <h3 class="text-lg font-semibold text-white">Projet &amp; déploiements</h3>
          <p class="text-xs text-slate-500 mt-1">
            Identifiant route : <span class="font-mono text-slate-400">{encodeURIComponent(appName)}</span>
            {packageName && <> · package <span class="font-mono text-blue-400/90">{packageName}</span></>}
          </p>
        </div>
        <button type="button" onClick={() => load()} class="btn btn-ghost btn-sm text-slate-400 hover:text-white shrink-0">Recharger</button>
      </div>

      <AppUrlsForm
        config={config}
        forgeVirtualHost={forgeVirtualHost}
        onChange={(patch) => setConfig((c) => c ? { ...c, ...patch } : c)}
        saving={saving}
        onSave={saveMeta}
        message={msg}
      />

      <div class="border-t border-slate-800 pt-6 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <h4 class="text-sm font-semibold text-white">Serveurs de développement</h4>
          <button type="button" onClick={addServer} disabled={servers.length >= 8} class="btn btn-ghost btn-xs text-blue-400">
            + Ajouter un serveur
          </button>
        </div>
        <p class="text-xs text-slate-500">
          Lance <span class="font-mono text-slate-400">npm run &lt;script&gt;</span> sur le disque du projet. Journaux : <span class="font-mono text-slate-600">.forge/dev-pids/*.log</span>.
        </p>
        <div class="space-y-4">
          {servers.map((s) => (
            <AppServerCard
              key={s.id}
              server={s}
              status={statuses[s.id] ?? null}
              devLocalBaseUrl={config.devLocalBaseUrl}
              npmScripts={npmScripts}
              busy={busyServer === s.id}
              canRemove={servers.length > 1}
              onUpdate={(patch) => updateServer(s.id, patch)}
              onAction={(action) => devAction(s.id, action)}
              onRemove={() => removeServer(s.id)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
