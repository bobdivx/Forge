type TaskStats = {
  total: number;
  completed: number;
  failed: number;
  running: number;
  pending: number;
};

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
};

type Props = {
  agent: Agent;
  taskStats?: TaskStats;
};

const AVATAR_COLORS = [
  ['bg-blue-500/20 text-blue-300 border-blue-500/30', '#3b82f6'],
  ['bg-violet-500/20 text-violet-300 border-violet-500/30', '#8b5cf6'],
  ['bg-emerald-500/20 text-emerald-300 border-emerald-500/30', '#10b981'],
  ['bg-amber-500/20 text-amber-300 border-amber-500/30', '#f59e0b'],
  ['bg-rose-500/20 text-rose-300 border-rose-500/30', '#f43f5e'],
  ['bg-cyan-500/20 text-cyan-300 border-cyan-500/30', '#06b6d4'],
  ['bg-indigo-500/20 text-indigo-300 border-indigo-500/30', '#6366f1'],
] as const;

function getAvatarColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function formatAgentName(name: string): string {
  if (name.includes('subagent:')) {
    const parts = name.split(':');
    return 'Sub-Agent (' + (parts.pop() || '').slice(0, 8) + ')';
  }
  return name.replace('telegram:g-agent-', '').replace('agent:', '').replace(':main', '').replace(/-/g, ' ')
    .split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

export function getAgentRole(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('architecte') || n.includes('architect')) return 'Architecte Logiciel';
  if (n.includes('dev') && n.includes('front')) return 'Dev Frontend';
  if (n.includes('dev') && n.includes('back')) return 'Dev Backend';
  if (n.includes('dev')) return 'Développeur';
  if (n.includes('test') || n.includes('qa')) return 'Testeur QA';
  if (n.includes('infra')) return 'Infra Tech';
  if (n.includes('securit') || n.includes('security')) return 'Sécurité';
  if (n.includes('prompt') || n.includes('maitre') || n.includes('maître')) return 'Maître Orchestrateur';
  if (n.includes('analyste') || n.includes('analyst')) return 'Analyste Code';
  if (n.includes('redacteur') || n.includes('doc')) return 'Rédacteur Doc';
  if (n.includes('veille')) return 'Veille Technologique';
  if (n.includes('github') || n.includes('git')) return 'Expert GitHub';
  if (n.includes('script') || n.includes('automate')) return 'Scripteur Automate';
  if (n.includes('hardware') || n.includes('ingenieur')) return 'Ingénieur Hardware';
  if (n.includes('maintenance')) return 'Maintenance Repo';
  if (n.includes('subagent')) return 'Sous-agent';
  return 'Agent IA';
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div class="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
      <div class="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AgentCard({ agent, taskStats }: Props) {
  const [avatarClass] = getAvatarColor(agent.name);
  const displayName = formatAgentName(agent.name);
  const role = getAgentRole(agent.name);
  const isActive = agent.status === 'actif';
  const stats = taskStats ?? { total: 0, completed: 0, failed: 0, running: 0, pending: 0 };
  const completionPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const modelShort = agent.model ? agent.model.split('/').pop()?.slice(0, 22) ?? '—' : '—';

  return (
    <a
      href={'/swarm/' + encodeURIComponent(agent.id)}
      class="group block bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-blue-500/40 hover:bg-slate-800/50 transition-all duration-200 shadow-md no-underline text-inherit"
    >
      <div class="flex items-start justify-between mb-5">
        <div class="flex items-center gap-3">
          <div class={`w-12 h-12 rounded-xl flex items-center justify-center font-bold text-lg border ${avatarClass} shrink-0`}>
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div class="min-w-0">
            <h3 class="font-bold text-white text-sm truncate max-w-[150px] group-hover:text-blue-300 transition-colors">{displayName}</h3>
            <p class="text-[10px] text-slate-500 mt-0.5 truncate max-w-[150px]">{role}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
          <span class={`text-[10px] font-bold uppercase tracking-wider ${isActive ? 'text-emerald-400' : 'text-slate-500'}`}>
            {isActive ? 'Actif' : 'Veille'}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2 mb-4">
        <svg class="w-3.5 h-3.5 text-slate-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
        <span class="text-[11px] font-mono text-slate-400 truncate">{modelShort}</span>
      </div>

      <div class="grid grid-cols-3 gap-2 mb-4">
        {[
          { v: stats.total, label: 'Tâches', cls: 'text-white' },
          { v: stats.completed, label: 'Terminées', cls: 'text-emerald-400' },
          { v: stats.failed, label: 'Erreurs', cls: 'text-rose-400' },
        ].map(({ v, label, cls }) => (
          <div key={label} class="bg-slate-950/60 rounded-lg p-2 text-center">
            <div class={`text-base font-bold tabular-nums ${cls}`}>{v}</div>
            <div class="text-[9px] uppercase text-slate-600 tracking-wider mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {stats.total > 0 && (
        <div class="mb-4">
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] text-slate-500">Complétion</span>
            <span class="text-[10px] font-mono text-slate-300">{completionPct}%</span>
          </div>
          <ProgressBar value={stats.completed} max={stats.total} />
        </div>
      )}

      <div class="pt-3 border-t border-slate-800/60 flex items-center justify-between">
        <span class="text-[10px] text-slate-500">{((agent.totalTokens ?? 0) / 1000).toFixed(1)}K tokens</span>
        {(agent.estimatedCostUsd ?? 0) > 0 && (
          <span class="text-[10px] font-mono font-bold text-emerald-400">${agent.estimatedCostUsd!.toFixed(3)}</span>
        )}
        <div class="text-blue-500 group-hover:translate-x-0.5 transition-transform">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      </div>
    </a>
  );
}
