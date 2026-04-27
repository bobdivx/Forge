/**
 * Identifiants agents Forge ↔ ZimaOS : casse et séparateurs diffèrent
 * (ex. chef_technique vs CHEF_TECHNIQUE). On normalise par clé alphanumérique.
 */
import { FORGE_AGENT_INSTRUCTION_ROWS } from './agent-instruction-defaults';

/** Clé stable pour comparer deux ids (ignore casse, underscores, tirets). */
export function normForgeAgentKey(s: string): string {
  return String(s).trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Extrait `chef_technique` depuis `agent:chef_technique:main`. */
function slugFromAgentSessionKey(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const parts = s.split(':').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2 && parts[0].toLowerCase() === 'agent') return parts[1] || '';
  return s;
}

/**
 * Retourne l’`agentId` canonique Forge (ex. CHEF_TECHNIQUE) si reconnu, sinon la chaîne nettoyée.
 */
export function resolveCanonicalForgeAgentId(raw: string): string {
  const t = String(raw || '').trim();
  if (!t) return '';

  const tryMatch = (candidate: string): string | null => {
    const nk = normForgeAgentKey(candidate);
    if (!nk) return null;
    for (const row of FORGE_AGENT_INSTRUCTION_ROWS) {
      if (normForgeAgentKey(row.agentId) === nk) return row.agentId;
    }
    return null;
  };

  const direct = tryMatch(t);
  if (direct) return direct;

  const slug = slugFromAgentSessionKey(t);
  if (slug && slug !== t) {
    const fromSlug = tryMatch(slug);
    if (fromSlug) return fromSlug;
  }

  return slug || t;
}
