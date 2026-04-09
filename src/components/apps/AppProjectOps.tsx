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
  externalProcess?: boolean;
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
  const [config, setConfig]       = useState<ForgeAppDashboardConfig | null>(null);
  const [npmScripts, setNpmScripts] = useState<string[]>([]);
  const [packageName, setPackageName] = useState<string | undefined>();
  const [loading, setLoading]     = useState(true);
  const [saving, setSaving]       = useState(false);
  const [msg, setMsg]             = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [statuses, setStatuses]   = useState<Record<string, ServerStatus | null>>({});
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
          next[s.id] = res.ok ? {
            running: Boolean(data.running),
            pid: data.pid ?? null,
            externalProcess: Boolean(data.externalProcess),
            port: data.port,
            npmScript: data.npmScript,
          } : null;
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

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading && !config) {
    return (
      <section class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 animate-pulse">
        <div class="h-4 bg-gray-100 rounded w-1/3 mb-4" />
        <div class="h-24 bg-gray-100 rounded" />
      </section>
    );
  }

  if (!config) {
    return (
      <section class="bg-white rounded-[1.5rem] shadow-sm border border-red-100 p-6 text-sm text-red-500">
        Impossible de charger la configuration projet.
      </section>
    );
  }

  const servers = config.servers || [];
  const anyRunning = servers.some((s) => statuses[s.id]?.running);

  return (
    <section class="bg-white rounded-[1.5rem] shadow-sm border border-gray-100 p-6 space-y-6">

      {/* ── En-tête ─────────────────────────────────────────────────────── */}
      <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <h3 class="text-base font-bold text-gray-900">Projet &amp; déploiements</h3>
            {anyRunning && (
              <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-50 text-green-600">● Actif</span>
            )}
          </div>
          <p class="text-[11px] text-gray-400 font-mono">
            {encodeURIComponent(appName)}
            {packageName && <> · <span class="text-[#175B37]">{packageName}</span></>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          class="self-start sm:self-auto text-xs text-gray-400 hover:text-gray-700 border border-gray-200 rounded-full px-3 py-1 transition-colors"
        >
          ↻ Recharger
        </button>
      </div>

      {/* ── URLs ────────────────────────────────────────────────────────── */}
      <AppUrlsForm
        config={config}
        forgeVirtualHost={forgeVirtualHost}
        onChange={(patch) => setConfig((c) => c ? { ...c, ...patch } : c)}
        saving={saving}
        onSave={saveMeta}
        message={msg}
      />

      {/* ── Serveurs de développement ────────────────────────────────────── */}
      <div class="border-t border-gray-100 pt-5 space-y-4">
        <div class="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h4 class="text-sm font-bold text-gray-800">Serveurs de développement</h4>
            <p class="text-[11px] text-gray-400 mt-0.5">
              Lance <span class="font-mono bg-gray-100 px-1 rounded">npm run &lt;script&gt;</span> dans le dossier du projet.
              Logs : <span class="font-mono">.forge/dev-pids/*.log</span>
            </p>
          </div>
          <button
            type="button"
            onClick={addServer}
            disabled={servers.length >= 8}
            class="text-xs font-medium px-3 py-1.5 rounded-full border border-[#175B37] text-[#175B37] hover:bg-green-50 transition-colors disabled:opacity-40"
          >
            + Ajouter un serveur
          </button>
        </div>
        <div class="space-y-3">
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
