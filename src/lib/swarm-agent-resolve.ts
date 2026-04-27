import { mapSessionToAgentRow } from './zimaos-gateway';

/**
 * Trouve la session ZimaOS brute correspondant à l’id d’URL swarm (ex. CHEF_TECHNIQUE).
 * Même heuristique que la page `swarm/[id]` + score utilisé côté `/api/agents`.
 */
export function findRawSessionForSwarmAgentKey(
  rawSessions: Record<string, unknown>[],
  agentKey: string,
): Record<string, unknown> | null {
  const want = agentKey.trim().toUpperCase();
  if (!want) return null;

  for (const s of rawSessions) {
    const keys = [s.sessionKey, s.key, s.id, s.agentId, s.agent_id].map((x) =>
      String(x ?? '').toUpperCase(),
    );
    if (keys.some((k) => k && (k === want || k.includes(want)))) return s;
  }

  let best: Record<string, unknown> | null = null;
  let bestScore = 0;
  let bestMs = -1;

  const sessionMatchScore = (raw: Record<string, unknown>, agentId: string): number => {
    const w = agentId.trim().toUpperCase();
    if (!w) return 0;
    const same = (v: unknown) => String(v ?? '').trim().toUpperCase() === w;
    if (same(raw.agentId) || same(raw.agent_id)) return 100;
    if (same(raw.displayName) || same(raw.display_name)) return 90;
    if (same(raw.label)) return 88;
    const keyStr = String(raw.key ?? raw.sessionKey ?? raw.session_key ?? '');
    if (keyStr) {
      const parts = keyStr
        .split(/[:\\/]+/)
        .map((p) => p.trim().toUpperCase())
        .filter(Boolean);
      if (parts.includes(w)) return 70;
    }
    const mapped = mapSessionToAgentRow(raw);
    if (String(mapped.name).toUpperCase() === w) return 60;
    const blob = [keyStr, String(raw.label), String(raw.name), String(raw.title), String(mapped.name)]
      .join(' ')
      .toUpperCase();
    if (w === 'EXPERT_GITHUB' && /\bGITHUB\b/.test(blob)) return 58;
    return 0;
  };

  for (const raw of rawSessions) {
    const score = sessionMatchScore(raw, agentKey);
    if (score === 0) continue;
    const ms = Number(mapSessionToAgentRow(raw).lastSeenMs) || 0;
    if (score > bestScore || (score === bestScore && ms > bestMs)) {
      bestScore = score;
      bestMs = ms;
      best = raw;
    }
  }
  return best;
}
