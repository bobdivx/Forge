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
  'bg-blue-100 text-blue-600',
  'bg-violet-100 text-violet-600',
  'bg-green-100 text-green-600',
  'bg-yellow-100 text-yellow-600',
  'bg-red-100 text-red-500',
  'bg-cyan-100 text-cyan-600',
  'bg-indigo-100 text-indigo-600',
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
  return name
    .replace('telegram:g-agent-', '').replace('agent:', '').replace(':main', '').replace(/-/g, ' ')
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
    <div class="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div class="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: '#3BAE61' }} />
    </div>
  );
}

export default function AgentCard({ agent, taskStats }: Props) {
  const avatarClass = getAvatarColor(agent.name);
  const displayName = formatAgentName(agent.name);
  const role = getAgentRole(agent.name);
  const isActive = agent.status === 'actif';
  const stats = taskStats ?? { total: 0, completed: 0, failed: 0, running: 0, pending: 0 };
  const completionPct = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
  const modelShort = agent.model ? agent.model.split('/').pop()?.slice(0, 22) ?? '—' : '—';

  return (
    <a
      href={'/swarm/' + encodeURIComponent(agent.id)}
      class="group block bg-white border border-gray-100 rounded-[1.5rem] p-5 hover:shadow-md hover:border-gray-200 transition-all duration-200 shadow-sm no-underline text-inherit"
    >
      <div class="flex items-start justify-between mb-4">
        <div class="flex items-center gap-3">
          <div class={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-base shrink-0 ${avatarClass}`}>
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div class="min-w-0">
            <h3 class="font-bold text-gray-900 text-sm truncate max-w-[150px] group-hover:text-[#175B37] transition-colors">{displayName}</h3>
            <p class="text-[10px] text-gray-400 mt-0.5 truncate max-w-[150px]">{role}</p>
          </div>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <span class={`w-2 h-2 rounded-full ${isActive ? 'animate-pulse' : 'bg-gray-300'}`} style={isActive ? 'background:#3BAE61' : undefined} />
          <span class="text-[10px] font-bold uppercase tracking-wider" style={isActive ? 'color:#3BAE61' : 'color:#9CA3AF'}>
            {isActive ? 'Actif' : 'Veille'}
          </span>
        </div>
      </div>

      <div class="flex items-center gap-2 mb-4">
        <svg class="w-3.5 h-3.5 text-gray-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
        </svg>
        <span class="text-[11px] font-mono text-gray-400 truncate">{modelShort}</span>
      </div>

      <div class="grid grid-cols-3 gap-2 mb-4">
        {[
          { v: stats.total,     label: 'Tâches',    color: '#1F2937' },
          { v: stats.completed, label: 'Terminées', color: '#3BAE61' },
          { v: stats.failed,    label: 'Erreurs',   color: '#EF4444' },
        ].map(({ v, label, color }) => (
          <div key={label} class="bg-gray-50 rounded-xl p-2 text-center border border-gray-100">
            <div class="text-base font-bold tabular-nums" style={{ color }}>{v}</div>
            <div class="text-[9px] uppercase text-gray-400 tracking-wider mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {stats.total > 0 && (
        <div class="mb-4">
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] text-gray-400">Complétion</span>
            <span class="text-[10px] font-mono text-gray-600">{completionPct}%</span>
          </div>
          <ProgressBar value={stats.completed} max={stats.total} />
        </div>
      )}

      <div class="pt-3 border-t border-gray-100 flex items-center justify-between">
        <span class="text-[10px] text-gray-400">{((agent.totalTokens ?? 0) / 1000).toFixed(1)}K tokens</span>
        {(agent.estimatedCostUsd ?? 0) > 0 && (
          <span class="text-[10px] font-mono font-bold" style="color:#3BAE61">${agent.estimatedCostUsd!.toFixed(3)}</span>
        )}
        <div class="text-gray-400 group-hover:text-[#175B37] group-hover:translate-x-0.5 transition-all">
          <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6" />
          </svg>
        </div>
      </div>
    </a>
  );
}
