/**
 * Profils « membres d'équipe » dérivés des agents OpenClaw / Forge.
 * Réutilisable par la page Discussion, les cartes Swarm, etc.
 */

export type AgentLike = {
  id: string;
  name: string;
  status: string;
  model: string;
  raw?: { offline?: boolean; disabledInDb?: boolean };
};

export type AgentTeamProfile = {
  id: string;
  /** Clé de session OpenClaw (identique à `id`, rappel explicite pour l’UI). */
  openClawSessionKey: string;
  displayName: string;
  role: string;
  initials: string;
  avatarClass: string;
  modelShort: string;
  presence: 'online' | 'away' | 'offline';
  presenceLabel: string;
  /** Bio / note d’équipe (issue de la fiche Forge ou null). */
  bio: string | null;
  avatarUrl: string | null;
  avatarEmoji: string | null;
};

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-violet-100 text-violet-700',
  'bg-emerald-100 text-emerald-700',
  'bg-amber-100 text-amber-800',
  'bg-rose-100 text-rose-700',
  'bg-cyan-100 text-cyan-700',
  'bg-indigo-100 text-indigo-700',
] as const;

export function formatAgentName(name: string): string {
  if (name.includes('subagent:')) {
    const parts = name.split(':');
    return `Sous-agent (${(parts.pop() || '').slice(0, 8)})`;
  }
  return name
    .replace('telegram:g-agent-', '')
    .replace('agent:', '')
    .replace(':main', '')
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function roleFromNameOrId(name: string, id: string): string | null {
  const n = name.toLowerCase();
  const i = id.toLowerCase();
  if (n.includes('architecte') || n.includes('architect') || i.includes('architect')) return 'Architecte logiciel';
  if ((n.includes('dev') && n.includes('front')) || i.includes('front')) return 'Développeur front-end';
  if ((n.includes('dev') && n.includes('back')) || i.includes('back')) return 'Développeur back-end';
  if (n.includes('dev') || i.includes('dev')) return 'Développeur';
  if (n.includes('test') || n.includes('qa') || i.includes('qa')) return 'Testeur QA';
  if (n.includes('infra') || i.includes('infra')) return 'Infra & plateforme';
  if (n.includes('securit') || n.includes('security') || i.includes('security')) return 'Sécurité';
  if (n.includes('prompt') || n.includes('maitre') || n.includes('maître') || i.includes('chef') || i.includes('orchestr'))
    return 'Chef d’orchestre';
  if (n.includes('analyste') || n.includes('analyst')) return 'Analyste';
  if (n.includes('redacteur') || n.includes('rédacteur') || n.includes('doc')) return 'Documentation';
  if (n.includes('veille')) return 'Veille techno';
  if (n.includes('github') || n.includes('git') || i.includes('github')) return 'Expert Git & PR';
  if (n.includes('script') || n.includes('automate')) return 'Automatisation';
  if (n.includes('hardware') || n.includes('ingénieur')) return 'Ingénierie';
  if (n.includes('maintenance')) return 'Maintenance dépôt';
  if (n.includes('subagent') || i.includes('subagent')) return 'Sous-agent';
  return null;
}

function roleFromModel(model: string): string | null {
  const m = model.toLowerCase();
  if (!m.trim()) return null;
  if (m.includes('embed')) return 'Spécialiste embeddings';
  if (m.includes('vision')) return 'Spécialiste vision';
  if (m.includes('code') || m.includes('coder')) return 'Spécialiste code';
  if (m.includes('gpt') || m.includes('claude') || m.includes('llama') || m.includes('mistral')) return 'Spécialiste LLM';
  return null;
}

export function inferAgentRole(agent: Pick<AgentLike, 'name' | 'id' | 'model'>): string {
  return roleFromNameOrId(agent.name, agent.id) ?? roleFromModel(agent.model) ?? 'Coéquipier IA';
}

export function getProfileInitials(displayName: string): string {
  const t = displayName.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return t.slice(0, 2).toUpperCase();
}

export function getAvatarPaletteClass(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = ((hash << 5) - hash + seed.charCodeAt(i)) | 0;
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export function shortModelLabel(model: string): string {
  if (!model?.trim()) return '—';
  const tail = model.split('/').pop()?.trim();
  return (tail || model).slice(0, 28);
}

function mapPresence(agent: AgentLike): { presence: AgentTeamProfile['presence']; presenceLabel: string } {
  if (agent.raw?.offline) return { presence: 'offline', presenceLabel: 'Hors ligne' };
  if (agent.raw?.disabledInDb) return { presence: 'offline', presenceLabel: 'Désactivé' };
  const s = agent.status.toLowerCase();
  if (s.includes('désactiv') || s.includes('desactiv')) return { presence: 'offline', presenceLabel: 'Indisponible' };
  if (s.includes('actif')) return { presence: 'online', presenceLabel: 'Disponible' };
  if (s.includes('veille')) return { presence: 'away', presenceLabel: 'En veille' };
  if (s.includes('occup') || s.includes('busy') || s.includes('cours'))
    return { presence: 'away', presenceLabel: agent.status };
  return { presence: 'away', presenceLabel: agent.status };
}

export function buildAgentTeamProfile(agent: AgentLike): AgentTeamProfile {
  const displayName = formatAgentName(agent.name);
  const role = inferAgentRole(agent);
  const initials = getProfileInitials(displayName);
  const avatarClass = getAvatarPaletteClass(`${agent.id}|${agent.name}`);
  const modelShort = shortModelLabel(agent.model);
  const { presence, presenceLabel } = mapPresence(agent);
  return {
    id: agent.id,
    openClawSessionKey: agent.id,
    displayName,
    role,
    initials,
    avatarClass,
    modelShort,
    presence,
    presenceLabel,
    bio: null,
    avatarUrl: null,
    avatarEmoji: null,
  };
}

export type OpenClawAgentProfileRow = {
  sessionKey: string;
  displayName?: string | null;
  roleTitle?: string | null;
  bio?: string | null;
  avatarUrl?: string | null;
  avatarEmoji?: string | null;
};

function cleanOpt(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s.trim();
  return t ? t : null;
}

export function mergeOpenClawTeamProfile(agent: AgentLike, row?: OpenClawAgentProfileRow | null): AgentTeamProfile {
  const base = buildAgentTeamProfile(agent);
  if (!row) return base;
  const displayName = cleanOpt(row.displayName) ?? base.displayName;
  const role = cleanOpt(row.roleTitle) ?? base.role;
  const initials = getProfileInitials(displayName);
  return {
    ...base,
    displayName,
    role,
    initials,
    bio: cleanOpt(row.bio),
    avatarUrl: cleanOpt(row.avatarUrl),
    avatarEmoji: cleanOpt(row.avatarEmoji),
  };
}

/** Compat : ancien nom utilisé par `AgentCard`. */
export function getAgentRole(name: string): string {
  return inferAgentRole({ name, id: name, model: '' });
}
