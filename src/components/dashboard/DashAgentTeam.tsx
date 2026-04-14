import { useState, useEffect } from 'preact/hooks';
import { formatAgentName, getAgentRole } from '../agents/AgentCard';

type Agent = { id: string; name: string; status?: string; model?: string; lastSeen?: string };

const AVATAR_BG = ['bg-pink-100', 'bg-green-100', 'bg-blue-100', 'bg-gray-100', 'bg-yellow-100', 'bg-purple-100'];

function statusBadge(status: string | undefined) {
  const s = String(status ?? '').toLowerCase();
  if (s === 'actif') return { label: 'Actif', cls: 'bg-green-50 text-green-600' };
  if (s === 'désactivé' || s === 'desactive') return { label: 'Désactivé', cls: 'bg-gray-100 text-gray-400' };
  // en veille, inconnu, offline
  return { label: 'En veille', cls: 'bg-gray-50 text-gray-400' };
}

function AgentRow({ agent, index }: { agent: Agent; index: number }) {
  const display = formatAgentName(agent.name || agent.id);
  const role = getAgentRole(agent.name || agent.id);
  const badge = statusBadge(agent.status);
  const avatarBg = AVATAR_BG[index % AVATAR_BG.length];
  const initial = display.charAt(0).toUpperCase();

  return (
    <li class="flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class={`w-10 h-10 rounded-full ${avatarBg} flex items-center justify-center font-bold text-sm text-gray-700 shrink-0`}>
          {initial}
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-gray-800 truncate">{display}</p>
          <p class="text-[10px] text-gray-400 truncate">
            {role}
            {agent.lastSeen && agent.lastSeen !== '—' && (
              <span class="ml-1 opacity-60">· {agent.lastSeen}</span>
            )}
          </p>
        </div>
      </div>
      <span class={`text-[10px] font-medium px-2 py-1 rounded shrink-0 ml-3 ${badge.cls}`}>
        {badge.label}
      </span>
    </li>
  );
}

export default function DashAgentTeam() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function load() {
      fetch('/api/agents')
        .then((r) => r.json())
        .then((data) => {
          const list: Agent[] = Array.isArray(data) ? data : (data.agents ?? []);
          setAgents(list.slice(0, 4));
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  return (
    <div class="bg-white p-6 rounded-[1.5rem] shadow-sm">
      <div class="flex justify-between items-center mb-6">
        <h3 class="font-semibold text-gray-800">Équipe agents</h3>
        <a
          href="/agents"
          class="text-xs border border-gray-200 rounded-full px-3 py-1 flex items-center gap-1 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          + Ajouter
        </a>
      </div>

      {loading ? (
        <ul class="flex flex-col gap-5">
          {[1, 2, 3].map((i) => (
            <li key={i} class="flex items-center gap-3">
              <div class="w-10 h-10 rounded-full bg-gray-100 animate-pulse shrink-0" />
              <div class="flex-1 space-y-1.5">
                <div class="h-3.5 bg-gray-100 rounded animate-pulse w-32" />
                <div class="h-3 bg-gray-100 rounded animate-pulse w-48" />
              </div>
            </li>
          ))}
        </ul>
      ) : agents.length === 0 ? (
        <p class="text-sm text-gray-400 text-center py-6">Aucun agent configuré</p>
      ) : (
        <ul class="flex flex-col gap-5">
          {agents.map((a, i) => (
            <AgentRow key={a.id} agent={a} index={i} />
          ))}
        </ul>
      )}
    </div>
  );
}
