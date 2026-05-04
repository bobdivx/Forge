/**
 * Détecte dans les données sessions ZimaOS une ligne finale :
 *   FORGE_DONE task=<id> status=completed|failed
 * puis met à jour la base (sans action manuelle des agents vers /api/agent-tasks).
 */

import {
  fetchZimaOSSessionsPayload,
  normalizeZimaOSSessions,
} from './zimaos-gateway';
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
  const sessions = normalizeZimaOSSessions(data);
  const parts: string[] = [];
  parts.push(JSON.stringify(data));
  for (const s of sessions) {
    if (s != null && typeof s === 'object') {
      parts.push(...collectStrings(s));
    }
  }
  return parts.join('\n');
}

export type ForgeZimaOSScanResult = {
  applied: number;
  skipped: boolean;
  reason?: string;
};

let _lastScanMs = 0;
const SCAN_INTERVAL_MS = 120_000;

import { loadAstroDb } from './load-astro-db';

const RE_PLAN = /<FORGE_PLAN>([\s\S]*?)<\/FORGE_PLAN>/gi;

export async function scanZimaOSForForgeDoneSignals(
  force = false,
): Promise<ForgeZimaOSScanResult> {
  const now = Date.now();
  if (!force && now - _lastScanMs < SCAN_INTERVAL_MS) {
    return { applied: 0, skipped: true, reason: 'throttle' };
  }
  _lastScanMs = now;

  const result = await fetchZimaOSSessionsPayload(undefined, {
    invokeOnly: true,
    sessionsListArgs: { limit: 80, messageLimit: 120 },
  });

  if (!result.ok) {
    return { applied: 0, skipped: true, reason: result.error || 'sessions_list indisponible' };
  }

  const sessions = normalizeZimaOSSessions(result.data);
  const seenDone = new Set<string>();
  const seenPlans = new Set<string>();
  let applied = 0;

  for (const s of sessions) {
    const rawText = JSON.stringify(s);
    
    // 1. Détection FORGE_DONE
    RE_DONE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = RE_DONE.exec(rawText)) !== null) {
      const tid = Number(m[1]);
      const sig = String(m[2]).toLowerCase() as 'completed' | 'failed';
      if (!Number.isFinite(tid) || tid < 1) continue;
      const key = `${tid}:${sig}`;
      if (seenDone.has(key)) continue;
      seenDone.add(key);
      const ok = await tryAutoCompleteTaskFromSignal(tid, sig, '[Forge — scan ZimaOS]');
      if (ok) applied++;
    }

    // 2. Détection FORGE_PLAN
    RE_PLAN.lastIndex = 0;
    let p: RegExpExecArray | null;
    while ((p = RE_PLAN.exec(rawText)) !== null) {
      const planContent = p[1].trim();
      if (seenPlans.has(planContent)) continue;
      seenPlans.add(planContent);

      try {
        // On essaie de trouver le projectId associé à cette session/tâche
        const { db, AgentTask, Request, eq, desc } = await loadAstroDb();
        const session = s as Record<string, unknown>;
        const agentId = String(session.agentId || session.sessionKey || '').trim();
        
        // On cherche la dernière tâche "running" de cet agent pour deviner le projet
        const runningTasks = await db.select().from(AgentTask)
          .where(eq(AgentTask.agentId, agentId))
          .orderBy(desc(AgentTask.createdAt))
          .limit(5);
        
        const currentTask = runningTasks.find(t => t.status === 'running') || runningTasks[0];
        const projectId = currentTask?.projectId;

        if (projectId) {
          let items: any[] = [];
          try {
            items = JSON.parse(planContent);
          } catch {
            const lines = planContent.split('\n').filter(l => l.trim().startsWith('-'));
            items = lines.map(l => ({ title: l.trim().slice(1).trim() }));
          }

          for (const item of items) {
            // Éviter les doublons de titre récents pour ce projet
            const existing = await db.select().from(Request)
               .where(eq(Request.projectId, projectId))
               .orderBy(desc(Request.createdAt))
               .limit(10);
            if (existing.some(e => e.title === item.title)) continue;

            await db.insert(Request).values({
              projectId,
              title: item.title,
              content: item.content || `Plan de travail détecté en arrière-plan par ${agentId}`,
              status: 'pending',
              priority: 'medium',
              author: agentId,
              requestType: 'Correction',
              assigneeAgentId: item.assignee || undefined,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            applied++;
          }
        }
      } catch (e) {
        console.warn('[scan-plans] failed to process plan:', e);
      }
    }
  }

  return { applied, skipped: false };
}
