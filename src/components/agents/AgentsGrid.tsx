import { useState, useEffect, useMemo } from 'preact/hooks';
import AgentCard from './AgentCard';
import AgentActivityChart from './AgentActivityChart';
import AgentsSwarmHeatRadar from './AgentsSwarmHeatRadar';
import TabBar from '../ui/TabBar';
import {
  buildAgentTeamProfile,
  type AgentTeamProfile,
} from '../../lib/agent-profile';
import { buildSwarmWorkDirective, type SwarmWorkCommand } from '../../lib/forge-agent-protocol';

type Agent = {
  id: string;
  name: string;
  status: string;
  model: string;
  contextTokens?: number | null;
  totalTokens?: number;
  estimatedCostUsd?: number;
  runtimeMs?: number;
  lastSeen?: string;
  lastSeenMs?: number;
  /** Dernière tâche running (agrégée depuis sous-agents projet si besoin) — voir GET /api/agents */
  currentWork?: {
    taskId: number;
    title: string;
    delegatedAgentId?: string;
  } | null;
  raw?: {
    offline?: boolean;
    disabledInDb?: boolean;
    registryOnly?: boolean;
    reason?: string;
  };
};

type ActivationAdvice = {
  message?: string;
};

type TaskStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
};

type AppVersionCheck = {
  ok?: boolean;
  updateAvailable?: boolean;
  latestVersion?: string | null;
  currentVersion?: string | null;
  latestUrl?: string | null;
  error?: string;
};

function buildChartData(agents: Agent[], taskStats: Record<string, TaskStats>, teamProfiles: Record<string, AgentTeamProfile>) {
  const CHART_COLORS = [
    '#175B37', '#3BAE61', '#2d8a4a', '#5ec986', '#134a2d', '#6b7280', '#9ca3af', '#374151',
  ];
  const labels = agents.map((a) => {
    const p = teamProfiles[a.id] ?? buildAgentTeamProfile(a);
    const full = (p.displayName || a.name).trim() || a.id;
    return full.length > 14 ? `${full.slice(0, 13)}…` : full;
  });
  const barData = {
    labels,
    datasets: [
      {
        label: 'Tâches totales',
        data: agents.map((a) => taskStats[a.id]?.total ?? 0),
        backgroundColor: agents.map((_, i) => CHART_COLORS[i % CHART_COLORS.length] + '99'),
      },
    ],
  };
  const allStats = Object.values(taskStats);
  const totals = allStats.reduce(
    (acc, s) => {
      acc.pending += s.pending;
      acc.running += s.running;
      acc.completed += s.completed;
      acc.failed += s.failed;
      return acc;
    },
    { pending: 0, running: 0, completed: 0, failed: 0 },
  );
  const doughnutData = {
    labels: ['En attente', 'En cours', 'Terminées', 'Erreurs'],
    datasets: [
      {
        data: [totals.pending, totals.running, totals.completed, totals.failed],
        backgroundColor: ['#EAB308', '#2563EB', '#3BAE61', '#EF4444'],
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };
  return { barData, doughnutData };
}

export default function AgentsGrid() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [taskStats, setTaskStats] = useState<Record<string, TaskStats>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'active' | 'idle'>('all');
  const [query, setQuery] = useState('');
  const [, setActivationAdvice] = useState<ActivationAdvice | null>(null);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [newAgentId, setNewAgentId] = useState('');
  const [newAgentModel, setNewAgentModel] = useState('');
  const [creating, setCreating] = useState(false);
  const [createMsg, setCreateMsg] = useState<string | null>(null);
  const [commandBusyByAgent, setCommandBusyByAgent] = useState<Record<string, boolean>>({});
  const [commandMsgByAgent, setCommandMsgByAgent] = useState<Record<string, string>>({});
  const [wakeBusy, setWakeBusy] = useState(false);
  const [wakeMsg, setWakeMsg] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<AppVersionCheck | null>(null);
  const [globalDefaultModel, setGlobalDefaultModel] = useState('Auto');
  const [savingGlobalDefault, setSavingGlobalDefault] = useState(false);
  const [timelineEvents, setTimelineEvents] = useState<Array<{ at: string; actor?: string; target?: string }>>([]);

  const loadGlobalDefault = async () => {
    try {
      const res = await fetch('/api/agent-default-model');
      const json = await res.json();
      if (json.model) setGlobalDefaultModel(json.model);
    } catch {}
  };

  const updateGlobalDefault = async (m: string) => {
    setGlobalDefaultModel(m);
    setSavingGlobalDefault(true);
    try {
      await fetch('/api/agent-default-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: m }),
      });
    } catch (e) {
      console.error(e);
    } finally {
      setSavingGlobalDefault(false);
    }
  };

  const buildVersionUpdateDirective = async (): Promise<string> => {
    try {
      const res = await fetch('/api/app-version');
      const data = (await res.json().catch(() => ({}))) as AppVersionCheck;
      if (!res.ok || !data?.updateAvailable) return '';
      const latest = String(data.latestVersion || '').trim();
      const current = String(data.currentVersion || '').trim();
      const releaseUrl = String(data.latestUrl || '').trim();
      if (!latest || !current) return '';
      return [
        '',
        '[FORGE_APP_UPDATE_CHECK]',
        `Version installée: ${current}`,
        `Version GitHub disponible: ${latest}`,
        releaseUrl ? `Release: ${releaseUrl}` : '',
        "Avant de démarrer la mission, prends en compte cette version plus récente et adapte le travail demandé.",
      ]
        .filter(Boolean)
        .join('\n');
    } catch {
      return '';
    }
  };

  const refreshAgentsNow = async () => {
    try {
      const data = await fetch('/api/agents').then((r) => r.json());
      setAgents(Array.isArray(data.agents) ? data.agents : []);
      setTaskStats(data.taskStats ?? {});
      setActivationAdvice(data.activationAdvice && typeof data.activationAdvice === 'object' ? data.activationAdvice : null);
    } catch {
      /* ignore refresh errors here */
    }
  };

  useEffect(() => {
    const load = () => {
      fetch('/api/agents')
        .then((r) => r.json())
        .then((data) => {
          setAgents(Array.isArray(data.agents) ? data.agents : Array.isArray(data) ? data : []);
          setTaskStats(data.taskStats ?? {});
          setActivationAdvice(data.activationAdvice && typeof data.activationAdvice === 'object' ? data.activationAdvice : null);
        })
        .catch(() => setError('Erreur de communication avec le coordinateur Forge.'))
        .finally(() => setLoading(false));
    };
    const loadAppVersion = () => {
      fetch('/api/app-version')
        .then((r) => r.json().catch(() => ({})))
        .then((data) => {
          if (data && typeof data === 'object') {
            setAppVersion(data as AppVersionCheck);
          } else {
            setAppVersion(null);
          }
        })
        .catch(() => setAppVersion(null));
    };
    const loadModels = () => {
      fetch('/api/models')
        .then((r) => r.json())
        .then((rows) => {
          const values = Array.isArray(rows)
            ? rows
                .map((m: { id?: string; name?: string }) => String(m.id || m.name || '').replace(/^[a-z0-9_-]+\//i, '').trim())
                .filter(Boolean)
            : [];
          const merged = Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
          setAvailableModels(merged);
          if (!newAgentModel && merged.length > 0) setNewAgentModel(merged[0]);
        })
        .catch(() => {
          setAvailableModels([]);
        });
    };
    const loadTimeline = () => {
      fetch('/api/swarm-timeline')
        .then((r) => r.json())
        .then((d) => {
          if (Array.isArray(d.events)) setTimelineEvents(d.events);
        })
        .catch(() => {});
    };
    load();
    loadTimeline();
    loadAppVersion();
    loadModels();
    loadGlobalDefault();
    const t = setInterval(load, 15000);
    const t2 = setInterval(loadTimeline, 12_000);
    return () => {
      clearInterval(t);
      clearInterval(t2);
    };
  }, []);

  const createAgent = async () => {
    const agentId = newAgentId.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!agentId || !newAgentModel) {
      setCreateMsg("Renseigne un ID et un modèle.");
      return;
    }
    setCreating(true);
    setCreateMsg(null);
    try {
      const r = await fetch('/api/agent-instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, model: newAgentModel, enabled: true }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) {
        setCreateMsg(typeof data.error === 'string' ? data.error : 'Création impossible.');
        return;
      }
      setCreateMsg(`Agent ${agentId} ajouté avec succès.`);
      setNewAgentId('');
      const refreshed = await fetch('/api/agents').then((x) => x.json());
      setAgents(Array.isArray(refreshed.agents) ? refreshed.agents : []);
      setTaskStats(refreshed.taskStats ?? {});
    } catch {
      setCreateMsg('Erreur réseau.');
    } finally {
      setCreating(false);
    }
  };

  const sendSwarmCommand = async (agentId: string, command: SwarmWorkCommand) => {
    const target = agents.find((a) => a.id === agentId);
    if (target?.raw?.disabledInDb) {
      setCommandMsgByAgent((prev) => ({ ...prev, [agentId]: 'Agent désactivé' }));
      return;
    }
    setCommandBusyByAgent((prev) => ({ ...prev, [agentId]: true }));
    setCommandMsgByAgent((prev) => ({ ...prev, [agentId]: 'Envoi…' }));
    try {
      const versionHint = command === 'start_work' ? await buildVersionUpdateDirective() : '';
      const directive = `${buildSwarmWorkDirective(command, 'direct')}${versionHint}`;
      const r = await fetch('/api/forge-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: `forge-command-${agentId}`,
          agentId,
          message: directive,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || data.ok === false) {
        setCommandMsgByAgent((prev) => ({
          ...prev,
          [agentId]: (typeof data.error === 'string' && data.error ? data.error : 'Commande refusée'),
        }));
        return;
      }
      const reply =
        data?.result && typeof data.result === 'object' && typeof data.result.reply === 'string'
          ? data.result.reply.trim()
          : '';
      setCommandMsgByAgent((prev) => ({
        ...prev,
        [agentId]: reply
          ? `Réponse reçue`
          : `Commande envoyée (${command.replace('_', ' ')})`,
      }));
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agentId
            ? {
                ...a,
                status:
                  command === 'start_work' || command === 'resume_work'
                    ? 'actif'
                    : 'en veille',
              }
            : a,
        ),
      );
      void refreshAgentsNow();
      window.setTimeout(() => {
        void refreshAgentsNow();
      }, 2200);
      window.setTimeout(() => {
        setCommandMsgByAgent((prev) => {
          const next = { ...prev };
          delete next[agentId];
          return next;
        });
      }, 6500);
    } catch {
      setCommandMsgByAgent((prev) => ({ ...prev, [agentId]: 'Erreur réseau' }));
    } finally {
      setCommandBusyByAgent((prev) => ({ ...prev, [agentId]: false }));
    }
  };

  const handleModelChange = async (agentId: string, newModel: string) => {
    try {
      const r = await fetch('/api/agent-instructions', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, model: newModel }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        console.error(typeof data.error === 'string' ? data.error : 'Mise à jour du modèle impossible');
        return;
      }
      await refreshAgentsNow();
    } catch {
      console.error('Erreur réseau lors du changement de modèle');
    }
  };

  const wakeForgeAgents = async () => {
    setWakeBusy(true);
    setWakeMsg('Lancement du swarm en cours...');
    try {
      const r = await fetch('/api/work-system', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      });
      const data = await r.json().catch(() => ({}));
      const awakened = data?.workCycle?.wakeReport?.awakened;
      const failed = data?.workCycle?.wakeReport?.failed;
      const sentCount = Array.isArray(awakened) ? awakened.length : 0;
      const failedCount = Array.isArray(failed) ? failed.length : 0;
      if (!r.ok) {
        setWakeMsg(typeof data?.error === 'string' ? data.error : 'Lancement impossible');
        return;
      }
      if (failedCount > 0) {
        setWakeMsg(`Lancement partiel: ${sentCount} ok, ${failedCount} en echec`);
      } else {
        setWakeMsg(`Swarm lancé pour ${sentCount} agent(s)`);
      }
      await refreshAgentsNow();
      window.setTimeout(() => void refreshAgentsNow(), 2200);
    } catch {
      setWakeMsg('Erreur réseau pendant le lancement du swarm');
    } finally {
      setWakeBusy(false);
    }
  };

  const getWakeStatusLabel = (agent: Agent): string => {
    const busy = Boolean(commandBusyByAgent[agent.id]);
    const commandMsg = String(commandMsgByAgent[agent.id] || '').trim();
    const st = taskStats[agent.id];
    if (busy) return 'Statut: envoi de directive...';
    if (commandMsg) {
      if (/réponse reçue/i.test(commandMsg)) return 'Statut: agent répond';
      if (/commande envoyée/i.test(commandMsg)) return 'Statut: directive envoyée';
      return `Statut: ${commandMsg}`;
    }
    if (st && st.running > 0) {
      return `Statut: en travail · ${st.running} tâche(s) « running » en base`;
    }
    if (agent.status === 'actif') return 'Statut: opérationnel';
    if (agent.raw?.disabledInDb) return 'Statut: désactivé';
    return 'Statut: en veille';
  };

  const teamProfiles = useMemo(() => {
    const map: Record<string, AgentTeamProfile> = {};
    for (const a of agents) {
      map[a.id] = buildAgentTeamProfile(a);
    }
    return map;
  }, [agents]);

  const activeCount = agents.filter((a) => a.status === 'actif').length;
  const runningCount = agents.filter((a) => (taskStats[a.id]?.running ?? 0) > 0 || a.currentWork).length;
  const pendingCount = Object.values(taskStats).reduce((sum, s) => sum + (s.pending ?? 0), 0);
  const { barData, doughnutData } = buildChartData(agents, taskStats, teamProfiles);

  const swarmPulseByAgent = useMemo(() => {
    const now = Date.now();
    const windowMs = 120_000;
    const ids = new Set(agents.map((a) => a.id));
    const out: Record<string, boolean> = {};
    for (const a of agents) out[a.id] = false;
    for (const ev of timelineEvents) {
      const t = new Date(ev.at).getTime();
      if (!Number.isFinite(t) || now - t > windowMs) continue;
      const from = String(ev.actor || '').trim();
      const to = String(ev.target || '').trim();
      for (const id of ids) {
        if (from === id || to === id || from.includes(id) || to.includes(id)) {
          out[id] = true;
        }
      }
    }
    return out;
  }, [agents, timelineEvents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rankAgent = (a: Agent) => {
      const stats = taskStats[a.id];
      const running = stats?.running ?? 0;
      const pending = stats?.pending ?? 0;
      const completed = stats?.completed ?? 0;
      const disabled = a.raw?.disabledInDb ? -1000 : 0;
      return disabled + running * 1000 + (a.currentWork ? 500 : 0) + (a.status === 'actif' ? 250 : 0) + pending * 20 + completed;
    };
    return agents.filter((a) => {
      if (filter === 'active' && a.status !== 'actif') return false;
      if (filter === 'idle' && a.status === 'actif') return false;
      if (!q) return true;
      const p = teamProfiles[a.id] ?? buildAgentTeamProfile(a);
      return (
        a.name.toLowerCase().includes(q) ||
        a.status.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        p.displayName.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q) ||
        (p.bio && p.bio.toLowerCase().includes(q))
      );
    }).sort((a, b) => rankAgent(b) - rankAgent(a) || a.id.localeCompare(b.id));
  }, [agents, filter, query, taskStats, teamProfiles]);

  if (loading) {
    return (
      <div class="space-y-8">
        <div class="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {[1, 2].map((i) => (
            <div key={i} class="h-48 animate-pulse rounded-[1.5rem] border border-gray-100 bg-white shadow-sm" />
          ))}
        </div>
        <div class="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} class="h-64 animate-pulse rounded-[1.5rem] border border-gray-100 bg-white shadow-sm" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div class="space-y-8">
      <div class="overflow-hidden rounded-[1.75rem] border border-[#175B37]/10 bg-gradient-to-br from-white via-[#F7FBF8] to-[#E9F3EB] p-5 shadow-sm">
        <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div class="min-w-0">
            <div class="mb-2 inline-flex items-center gap-2 rounded-full border border-[#175B37]/15 bg-white/80 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#175B37]">
              <span class="relative flex h-2 w-2">
                <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#3BAE61] opacity-75" />
                <span class="relative inline-flex h-2 w-2 rounded-full bg-[#3BAE61]" />
              </span>
              Radar agents Forge
            </div>
            <h4 class="text-xl font-black text-gray-900">Activité de l’équipe en temps réel</h4>
            <p class="mt-1 max-w-2xl text-sm text-gray-500">
              Les agents en mission sont triés en premier. Les cartes affichent la mission courante, la file de tâches et
              la présence du modèle LLM sans dépendre d’un runtime externe.
            </p>
          </div>
          <div class="grid grid-cols-3 gap-2 sm:min-w-[420px]">
            <div class="rounded-2xl border border-white/70 bg-white/80 p-3 text-center shadow-sm">
              <p class="text-2xl font-black text-blue-600">{runningCount}</p>
              <p class="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">En mission</p>
            </div>
            <div class="rounded-2xl border border-white/70 bg-white/80 p-3 text-center shadow-sm">
              <p class="text-2xl font-black text-[#175B37]">{activeCount}</p>
              <p class="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">Disponibles</p>
            </div>
            <div class="rounded-2xl border border-white/70 bg-white/80 p-3 text-center shadow-sm">
              <p class="text-2xl font-black text-amber-600">{pendingCount}</p>
              <p class="mt-1 text-[9px] font-black uppercase tracking-widest text-gray-400">En attente</p>
            </div>
          </div>
        </div>
      </div>

      <AgentsSwarmHeatRadar taskStats={taskStats} events={timelineEvents} agentCount={agents.length} />

      <details class="group rounded-[1.5rem] border border-gray-100 bg-white shadow-sm">
        <summary class="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-sm font-bold text-gray-900 [&::-webkit-details-marker]:hidden">
          <span>Graphiques d’activité</span>
          <span class="text-xs font-semibold text-gray-400 transition group-open:rotate-180">⌄</span>
        </summary>
        <div class="border-t border-gray-100 p-4">
          <AgentActivityChart barData={barData} doughnutData={doughnutData} />
        </div>
      </details>

      {appVersion?.updateAvailable && appVersion.latestVersion && appVersion.currentVersion && (
        <div class="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <span class="font-semibold">Mise à jour disponible :</span>{' '}
          v{appVersion.currentVersion} → v{appVersion.latestVersion}
          {appVersion.latestUrl && (
            <>
              {' '}
              ·{' '}
              <a
                href={appVersion.latestUrl}
                target="_blank"
                rel="noreferrer"
                class="font-medium underline"
                style={{ color: '#175B37' }}
              >
                Voir la release
              </a>
            </>
          )}
        </div>
      )}

      <div class="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span class="text-sm text-gray-500">
          <span class="font-semibold text-gray-900">{agents.length}</span> agent(s) configuré(s) —{' '}
          <span class="font-semibold" style={{ color: '#3BAE61' }}>
            {activeCount}
          </span>{' '}
          disponible(s), <span class="font-semibold text-blue-600">{runningCount}</span> en mission
        </span>
        <div class="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <div class="flex items-center gap-2 bg-white border border-gray-200 rounded-full px-3 py-1.5 shadow-sm">
            <span class="text-[9px] font-black text-gray-400 uppercase tracking-widest whitespace-nowrap">Défaut :</span>
            <select
              value={globalDefaultModel}
              onChange={(e) => updateGlobalDefault((e.target as HTMLSelectElement).value)}
              disabled={savingGlobalDefault}
              class="bg-transparent text-[11px] font-bold text-gray-900 outline-none min-w-[120px]"
            >
              <option value="Auto">Auto (Recommandé)</option>
              {availableModels.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void wakeForgeAgents()}
            disabled={wakeBusy}
            class="rounded-full border border-[#175B37]/20 bg-[#175B37] px-3 py-2 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {wakeBusy ? 'Activation…' : 'Lancer le swarm'}
          </button>
          <label class="relative block w-full sm:w-52">
            <span class="sr-only">Filtrer les agents</span>
            <svg
              class="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="search"
              class="w-full rounded-full border border-gray-200 bg-gray-50 py-2 pl-8 pr-3 text-xs text-gray-800 outline-none transition focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15"
              placeholder="Rechercher (nom, rôle, id…)"
              value={query}
              onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            />
          </label>
          <TabBar
            className="shrink-0"
            tone="forge"
            tabs={[
              { id: 'all', label: 'Tous' },
              { id: 'active', label: 'Actifs' },
              { id: 'idle', label: 'Veille' },
            ]}
            active={filter}
            onChange={(id) => setFilter(id as 'all' | 'active' | 'idle')}
          />
        </div>
      </div>
      {wakeMsg && (
        <div class="rounded-[1.5rem] border border-gray-100 bg-white px-4 py-3 text-xs text-gray-700 shadow-sm">
          {wakeMsg}
        </div>
      )}
      {error && (
        <div class="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {error}
        </div>
      )}

      <div class="rounded-[1.5rem] border border-gray-100 bg-white p-4 shadow-sm">
        <p class="mb-3 text-sm font-semibold text-gray-900">Ajouter un agent</p>
        <div class="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={newAgentId}
            onInput={(e) => setNewAgentId((e.target as HTMLInputElement).value)}
            placeholder="ID agent (ex: DEV_DATA)"
            class="rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 outline-none transition focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15 min-w-[180px]"
          />
          <select
            value={newAgentModel}
            onChange={(e) => setNewAgentModel((e.target as HTMLSelectElement).value)}
            class="rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 outline-none transition focus:border-[#175B37]/50 focus:bg-white focus:ring-2 focus:ring-[#175B37]/15 min-w-[220px]"
          >
            <option value="" disabled>
              Choisir un modèle
            </option>
            {availableModels.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void createAgent()}
            disabled={creating}
            class="rounded-full px-4 py-2 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: '#175B37' }}
          >
            {creating ? 'Ajout…' : 'Ajouter'}
          </button>
          {createMsg && <span class="text-xs text-gray-600">{createMsg}</span>}
        </div>
      </div>

      {filtered.length > 0 ? (
        <>
          <div class="flex items-center justify-between md:hidden">
            <p class="text-[11px] font-semibold uppercase tracking-widest text-gray-400">
              Balayez pour parcourir les agents
            </p>
            <span class="rounded-full border border-gray-200 bg-white px-2 py-1 text-[10px] font-bold text-gray-500">
              {filtered.length} cartes
            </span>
          </div>
          <div class="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:grid-cols-2 md:overflow-visible md:px-0 md:pb-0 xl:grid-cols-4">
          {filtered.map((agent) => (
            <div key={agent.id} class="w-[82vw] max-w-[22rem] shrink-0 snap-start md:w-auto md:max-w-none">
              <AgentCard
                agent={agent}
                taskStats={taskStats[agent.id]}
                teamProfile={teamProfiles[agent.id]!}
                onSwarmCommand={sendSwarmCommand}
                commandBusy={Boolean(commandBusyByAgent[agent.id])}
                commandMessage={commandMsgByAgent[agent.id] ?? null}
                wakeStatusLabel={getWakeStatusLabel(agent)}
                onModelChange={handleModelChange}
                swarmPulse={Boolean(swarmPulseByAgent[agent.id])}
              />
            </div>
          ))}
          </div>
        </>
      ) : (
        <div class="rounded-[1.5rem] border border-gray-100 bg-white p-12 text-center shadow-sm">
          <p class="text-sm text-gray-500">
            {filter !== 'all' || query.trim()
              ? 'Aucun agent ne correspond à ce filtre ou à cette recherche.'
              : 'Aucun agent configuré dans Forge Core.'}
          </p>
        </div>
      )}
    </div>
  );
}
