import { useState, useEffect } from 'preact/hooks';

export type DashProject = {
  id: number | string;
  name: string;
  status?: string | null;
  updatedAt?: string | null;
  swarmEnabled?: number | null;
};

type HealthProject = {
  id: number;
  name: string;
  swarmEnabled: boolean;
  devServer: {
    ok: boolean;
    running?: boolean;
    pidTracked?: boolean;
    portOccupiedExternally?: boolean;
    label?: string;
    port?: number;
    hint?: string;
  };
  tasks: { pendingOrRunning: number; running: number };
};

type SwarmHealth = {
  zimaosOk: boolean;
  zimaosSessions: number;
  agentsBusy: number;
  zimaosError: string | null;
  workScheduler: {
    state: string;
    schedulerActive: boolean;
    inScheduledWindow: boolean;
    lastStartedAt: string | null;
  } | null;
};

type Props = { projects: DashProject[] };

function PulseDot({
  tone,
  title,
}: {
  tone: 'live' | 'idle' | 'warn' | 'muted';
  title?: string;
}) {
  const ring =
    tone === 'live'
      ? 'bg-emerald-500 shadow-[0_0_0_3px_rgba(16,185,129,0.35)] animate-pulse'
      : tone === 'warn'
        ? 'bg-amber-400 shadow-[0_0_0_2px_rgba(251,191,36,0.35)]'
        : tone === 'muted'
          ? 'bg-gray-300'
          : 'bg-gray-400';
  return (
    <span title={title} class={`inline-flex h-2 w-2 shrink-0 rounded-full ${ring}`} aria-hidden />
  );
}

export default function DashProjectList({ projects }: Props) {
  const list = Array.isArray(projects) ? projects : [];
  const [health, setHealth] = useState<{
    projects: HealthProject[];
    swarm: SwarmHealth;
    dbError: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch('/api/dashboard-projects-health');
        if (!res.ok || cancelled) return;
        const j = await res.json();
        if (!cancelled) setHealth(j);
      } catch {
        if (!cancelled) setHealth(null);
      }
    }
    load();
    const t = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const byId = new Map<number, HealthProject>();
  health?.projects?.forEach((p) => byId.set(p.id, p));

  const swarm = health?.swarm;

  const ICONS = [
    { bg: 'bg-blue-100', text: 'text-blue-600' },
    { bg: 'bg-teal-100', text: 'text-teal-600' },
    { bg: 'bg-green-100', text: 'text-green-500' },
    { bg: 'bg-yellow-100', text: 'text-yellow-500' },
    { bg: 'bg-purple-100', text: 'text-purple-600' },
    { bg: 'bg-pink-100', text: 'text-pink-600' },
  ];

  return (
    <div class="bg-white p-6 rounded-[1.5rem] shadow-sm border border-gray-100">
      <div class="flex justify-between items-start mb-4 gap-3">
        <div>
          <h3 class="font-semibold text-gray-800">Projets</h3>
          <p class="text-[10px] text-gray-400 mt-1 leading-relaxed max-w-[280px]">
            Indicateurs mis à jour ~15 s : swarm actif, serveur dev (.forge/app-dashboard.json), file de tâches.
          </p>
        </div>
        <a
          href="/apps"
          class="text-xs border border-gray-200 rounded-full px-3 py-1 flex items-center gap-1 text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
        >
          + Nouveau
        </a>
      </div>

      {/* Liaison swarm / ZimaOS */}
      <div class="mb-4 rounded-xl bg-gray-50 border border-gray-100 px-3 py-2.5 space-y-1.5">
        {!health && <div class="h-10 rounded-lg bg-gray-100 animate-pulse" />}
        {health?.dbError && (
          <p class="text-[11px] text-red-600">
            Base : {health.dbError}
          </p>
        )}
        {health && !health.dbError && swarm && (
          <>
            <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
              <span class="text-gray-500 font-medium">ZimaOS</span>
              {swarm.zimaosOk ? (
                <span class="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                  <PulseDot tone="live" title="Gateway joignable" />
                  {swarm.agentsBusy > 0
                    ? `${swarm.agentsBusy} session(s) active(s)`
                    : `${swarm.zimaosSessions} session(s) · veille`}
                </span>
              ) : (
                <span class="inline-flex items-center gap-1.5 text-amber-700">
                  <PulseDot tone="warn" title={swarm.zimaosError ?? 'Gateway injoignable'} />
                  Injoignable
                </span>
              )}
            </div>
            {swarm.zimaosError && (
              <p class="text-[10px] text-amber-800 font-mono break-all bg-amber-50 rounded px-2 py-1">
                {swarm.zimaosError}
              </p>
            )}
            {swarm.workScheduler && (
              <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-600">
                <span class="text-gray-500 font-medium">Travail auto</span>
                <span>
                  {swarm.workScheduler.state === 'scheduled' &&
                  swarm.workScheduler.inScheduledWindow &&
                  swarm.workScheduler.lastStartedAt
                    ? 'Cycle récent'
                    : swarm.workScheduler.state === 'running'
                      ? 'Manuel actif'
                      : swarm.workScheduler.state === 'stopped'
                        ? 'Arrêté'
                        : swarm.workScheduler.inScheduledWindow
                          ? 'Plage horaire'
                          : 'Hors plage'}
                </span>
                {!swarm.workScheduler.schedulerActive && (
                  <span class="text-amber-600">Scheduler inactif</span>
                )}
              </div>
            )}
            {!swarm.zimaosOk && (
              <a href="/settings" class="text-[10px] text-[#175B37] hover:underline font-medium">
                Paramètres → Connexion ZimaOS
              </a>
            )}
          </>
        )}
      </div>

      {list.length === 0 ? (
        <p class="text-sm text-gray-400 py-6 text-center">Aucun projet en base</p>
      ) : (
        <ul class="flex flex-col gap-4">
          {list.slice(0, 5).map((p, i) => {
            const color = ICONS[i % ICONS.length];
            const initial = p.name.charAt(0).toUpperCase();
            const dateStr = p.updatedAt
              ? new Date(p.updatedAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })
              : null;

            const hid = typeof p.id === 'number' ? p.id : Number(p.id);
            const h = Number.isFinite(hid) ? byId.get(hid) : undefined;

            const swarmOn = h?.swarmEnabled ?? Number(p.swarmEnabled) === 1;

            let devTone: 'live' | 'idle' | 'warn' | 'muted' = 'muted';
            let devLabel = 'Dev';
            if (h?.devServer?.ok && h.devServer.running) {
              if (h.devServer.pidTracked) {
                devTone = 'live';
                devLabel = `Dev · :${h.devServer.port ?? '?'}`;
              } else if (h.devServer.portOccupiedExternally) {
                devTone = 'warn';
                devLabel = `Port ${h.devServer.port ?? '?'} occupé`;
              } else {
                devTone = 'idle';
                devLabel = `Port ${h.devServer.port ?? '?'}`;
              }
            } else if (h?.devServer?.ok === false && h.devServer.hint) {
              devLabel = 'Hors disque';
            } else if (h?.devServer?.ok && !h.devServer.running) {
              devLabel = `Arrêté · :${h.devServer.port ?? '?'}`;
              devTone = 'muted';
            }

            const taskPulse = (h?.tasks.running ?? 0) > 0;
            const taskLabel =
              (h?.tasks.pendingOrRunning ?? 0) > 0
                ? `${h?.tasks.running ?? 0}/${h?.tasks.pendingOrRunning ?? 0} tâche(s)`
                : 'Aucune tâche';

            return (
              <li key={String(p.id)}>
                <a href={`/apps/by-id/${p.id}`} class="flex items-start gap-3 no-underline group">
                  <div class="relative shrink-0">
                    <div
                      class={`w-9 h-9 rounded-full ${color.bg} ${color.text} flex items-center justify-center font-bold text-xs`}
                    >
                      {initial}
                    </div>
                    {taskPulse && (
                      <span class="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                        <span class="relative inline-flex rounded-full h-3 w-3 bg-indigo-500 ring-2 ring-white" />
                      </span>
                    )}
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-sm font-semibold text-gray-800 group-hover:text-[#175B37] transition-colors truncate">
                      {p.name}
                    </p>
                    <div class="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1">
                      <span class="inline-flex items-center gap-1 text-[10px] text-gray-500" title="Projet inclus dans le swarm (travail auto + tâches)">
                        <PulseDot tone={swarmOn ? 'live' : 'muted'} title={swarmOn ? 'Swarm ON' : 'Swarm OFF'} />
                        <span class={swarmOn ? 'text-emerald-700 font-medium' : ''}>Swarm</span>
                      </span>
                      <span class="text-gray-200">·</span>
                      <span
                        class="inline-flex items-center gap-1 text-[10px] text-gray-500 max-w-[140px]"
                        title={h?.devServer?.hint ?? ''}
                      >
                        <PulseDot tone={devTone} />
                        <span class="truncate">{devLabel}</span>
                      </span>
                      <span class="text-gray-200">·</span>
                      <span
                        class={`text-[10px] truncate ${taskPulse ? 'text-indigo-600 font-medium' : 'text-gray-400'}`}
                        title="Tâches AgentTask pending / running pour ce projet"
                      >
                        {taskLabel}
                      </span>
                    </div>
                    <p class="text-[10px] text-gray-400 truncate mt-0.5">
                      {dateStr ? `Mis à jour : ${dateStr}` : '—'}
                      {h?.devServer?.hint && h.devServer.ok && (
                        <span class="block text-[9px] text-gray-400 mt-0.5 opacity-90">{h.devServer.hint}</span>
                      )}
                    </p>
                  </div>
                </a>
              </li>
            );
          })}
        </ul>
      )}

      {list.length > 5 && (
        <a href="/apps" class="block text-xs text-[#175B37] hover:underline mt-4 text-center font-medium">
          Voir tous les projets →
        </a>
      )}
    </div>
  );
}
