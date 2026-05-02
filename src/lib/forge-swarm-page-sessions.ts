/**
 * Point d’entrée unique pour la page `/swarm/[id]` afin de lire l’état live ZimaOS.
 * Le reste de la fiche (profil, instruction, missions) reste 100 % Forge (DB).
 */
import {
  fetchZimaOSSessionsPayload,
  normalizeZimaOSSessions,
  mapSessionToAgentRow,
} from './zimaos-gateway';
import { findRawSessionForSwarmAgentKey } from './swarm-agent-resolve';

export async function loadSwarmAgentLiveFromGateway(
  email: string | undefined,
  agentKey: string,
): Promise<ReturnType<typeof mapSessionToAgentRow> | null> {
  if (!agentKey.trim()) return null;
  try {
    const result = await fetchZimaOSSessionsPayload(email);
    if (!result.ok) return null;
    const sessions = normalizeZimaOSSessions(result.data) as Record<string, unknown>[];
    const sessionObj = findRawSessionForSwarmAgentKey(sessions, agentKey);
    return sessionObj ? mapSessionToAgentRow(sessionObj) : null;
  } catch {
    return null;
  }
}
