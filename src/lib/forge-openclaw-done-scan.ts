/**
 * Détecte dans les données sessions OpenClaw une ligne finale :
 *   FORGE_DONE task=<id> status=completed|failed
 * puis met à jour la base (sans action manuelle des agents vers /api/agent-tasks).
 */

import {
  fetchOpenClawSessionsPayload,
  normalizeOpenClawSessions,
} from './openclaw-gateway';
import { tryAutoCompleteTaskFromSignal } from './forge-task-status-sync';

const RE_DONE =
  /FORGE_DONE\s+task=\s*(\d+)\s+status=\s*(completed|failed)\b/gi;

function collectStrings(v: unknown, maxDepth = 8, depth = 0): string[] {
  if (depth > maxDepth || v == null) return [];
  if (typeof v === 'string') return v.length ? [v] : [];
  if (typeof v === 'number' || typeof v === 'boolean') return [String(v)];
  if (Array.isArray(v)) return v.flatMap((x) => collectStrings(x, maxDepth, depth + 1));
  if (typeof v === 'object') {
    const out: string[] = [];
    for (const k of Object.keys(v as object)) {
      out.push(...collectStrings((v as Record<string, unknown>)[k], maxDepth, depth + 1));
    }
    return out;
  }
  return [];
}

/** Agrège tout texte potentiellement exposé par sessions_list (+ messages). */
function buildHaystackFromSessionsPayload(data: unknown): string {
  const sessions = normalizeOpenClawSessions(data);
  const parts: string[] = [];
  parts.push(JSON.stringify(data));
  for (const s of sessions) {
    if (s != null && typeof s === 'object') {
      parts.push(...collectStrings(s));
    }
  }
  return parts.join('\n');
}

export type ForgeOpenClawScanResult = {
  applied: number;
  skipped: boolean;
  reason?: string;
};

let _lastScanMs = 0;
const SCAN_INTERVAL_MS = 120_000;

/**
 * Interroge OpenClaw (sessions_list avec messageLimit) et applique les FORGE_DONE trouvés.
 * Limité en fréquence pour ne pas surcharger la gateway.
 */
export async function scanOpenClawForForgeDoneSignals(
  force = false,
): Promise<ForgeOpenClawScanResult> {
  const now = Date.now();
  if (!force && now - _lastScanMs < SCAN_INTERVAL_MS) {
    return { applied: 0, skipped: true, reason: 'throttle' };
  }
  _lastScanMs = now;

  const result = await fetchOpenClawSessionsPayload(undefined, {
    invokeOnly: true,
    sessionsListArgs: { limit: 80, messageLimit: 120 },
  });

  if (!result.ok) {
    return { applied: 0, skipped: true, reason: result.error || 'sessions_list indisponible' };
  }

  const haystack = buildHaystackFromSessionsPayload(result.data);
  const seen = new Set<string>();
  let applied = 0;

  RE_DONE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = RE_DONE.exec(haystack)) !== null) {
    const tid = Number(m[1]);
    const sig = String(m[2]).toLowerCase() as 'completed' | 'failed';
    if (!Number.isFinite(tid) || tid < 1) continue;
    const key = `${tid}:${sig}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const ok = await tryAutoCompleteTaskFromSignal(
      tid,
      sig,
      '[Forge — scan OpenClaw FORGE_DONE]',
    );
    if (ok) applied++;
  }

  return { applied, skipped: false };
}
