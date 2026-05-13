/**
 * Daemon Forge GitHub Watcher.
 *
 * Tourne en arrière-plan (singleton globalThis) et :
 *  - liste les Projects actifs
 *  - résout owner/repo via le remote git (ou Config si absent)
 *  - liste les PR ouvertes via `ghListPullRequests`
 *  - classe chaque PR (heuristique MVP, hook LLM prêt) :
 *      useful | duplicate | already_done | needs_more_info | ignored
 *  - persiste la décision dans `GithubWatchDecision`
 *  - crée une `Request` quand la décision est `useful`
 *
 * Phase 4 — MVP heuristique : le LLM réel viendra en Phase 5 si jugé utile.
 */
import { desc, eq, and, gte } from 'drizzle-orm';
import { loadAstroDb } from './load-astro-db';
import { getConfig } from './config-db';
import { ghListPullRequests } from './forge-github-api';
import { insertForgeActivityLog } from './forge-activity-log';
import { resolveProjectPathFromDbProject } from './forge-repos';
import { getZimaOSInfraClient } from './forge-infra-client';

export type GithubWatchDecisionType =
  | 'useful'
  | 'duplicate'
  | 'already_done'
  | 'needs_more_info'
  | 'ignored';

export type GithubWatcherStatus = {
  running: boolean;
  intervalMinutes: number;
  lastRunAt: string | null;
  lastRunDurationMs: number | null;
  lastRunPrCount: number;
  lastRunError: string | null;
  nextRunAt: string | null;
};

// ── Singleton state ─────────────────────────────────────────────────────────

declare global {
  var __forgeGithubWatcher:
    | {
        timer: NodeJS.Timeout | null;
        running: boolean;
        intervalMinutes: number;
        lastRunAt: Date | null;
        lastRunDurationMs: number | null;
        lastRunPrCount: number;
        lastRunError: string | null;
      }
    | undefined;
}

function getState() {
  if (!globalThis.__forgeGithubWatcher) {
    globalThis.__forgeGithubWatcher = {
      timer: null,
      running: false,
      intervalMinutes: 10,
      lastRunAt: null,
      lastRunDurationMs: null,
      lastRunPrCount: 0,
      lastRunError: null,
    };
  }
  return globalThis.__forgeGithubWatcher;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseGithubRepoFromRemote(remoteUrl: string | null | undefined): { owner: string; repo: string } | null {
  if (!remoteUrl) return null;
  const m = String(remoteUrl).match(/github\.com[:/]([^/]+)\/([^/.]+)(?:\.git)?\/?$/i);
  if (!m) return null;
  return { owner: m[1]!, repo: m[2]! };
}

async function resolveOwnerRepoForProject(project: Record<string, unknown>): Promise<{ owner: string; repo: string } | null> {
  // 1. Essai depuis le remote git
  try {
    const projectPath = await resolveProjectPathFromDbProject(project as never);
    if (projectPath) {
      const infra = await getZimaOSInfraClient();
      const remote = infra.exec(`cd "${projectPath}" && git remote get-url origin 2>/dev/null || true`).trim();
      const parsed = parseGithubRepoFromRemote(remote);
      if (parsed) return parsed;
    }
  } catch {
    /* fallback */
  }
  return null;
}

type PR = {
  number: number;
  title: string;
  user?: { login?: string };
  labels?: Array<{ name: string }>;
  draft?: boolean;
  body?: string | null;
  html_url?: string;
};

function isDependabotPr(pr: PR): boolean {
  return /dependabot/i.test(pr.user?.login || '') || (pr.labels || []).some((l) => /dependencies/i.test(l.name));
}

function isDocOnly(pr: PR): boolean {
  return /\b(docs?|readme|typo|comment)\b/i.test(pr.title);
}

function classifyHeuristic(pr: PR, knownTitles: Set<string>): { decision: GithubWatchDecisionType; justification: string } {
  const titleLower = pr.title.toLowerCase().trim();
  if (knownTitles.has(titleLower)) {
    return { decision: 'duplicate', justification: 'Une demande avec un titre identique existe déjà.' };
  }
  if (pr.draft) {
    return { decision: 'needs_more_info', justification: 'PR en brouillon — attendre la finalisation.' };
  }
  if (isDependabotPr(pr)) {
    return { decision: 'useful', justification: 'Mise à jour automatique des dépendances (Dependabot).' };
  }
  if (isDocOnly(pr)) {
    return { decision: 'useful', justification: 'Modification documentation/typo — faible risque, à examiner rapidement.' };
  }
  if (/\b(wip|do not merge)\b/i.test(pr.title)) {
    return { decision: 'needs_more_info', justification: 'Marquée WIP / Do Not Merge.' };
  }
  return { decision: 'useful', justification: 'Contribution externe à examiner par un mainteneur Forge.' };
}

// ── Core run ─────────────────────────────────────────────────────────────────

export async function runGithubWatcherNow(): Promise<{ ok: boolean; prCount: number; error?: string }> {
  const state = getState();
  const start = Date.now();
  state.running = true;
  try {
    const { db, Project, Request, GithubWatchDecision } = await loadAstroDb();
    const projects = await db.select().from(Project).where(eq(Project.status, 'active'));
    let totalPrs = 0;
    for (const project of projects) {
      const or = await resolveOwnerRepoForProject(project as Record<string, unknown>);
      if (!or) continue;
      const res = await ghListPullRequests(or.owner, or.repo, 'open');
      if (!res.ok || !Array.isArray(res.data)) continue;
      const prs = res.data as PR[];
      totalPrs += prs.length;

      // Charge titres connus (Request) pour détecter doublons.
      const existingRequests = await db.select().from(Request).where(eq(Request.projectId, project.id));
      const knownTitles = new Set(existingRequests.map((r) => r.title.toLowerCase().trim()));

      for (const pr of prs) {
        // Skip si décision récente (24h) déjà enregistrée.
        const since = new Date(Date.now() - 24 * 3600 * 1000);
        if (GithubWatchDecision) {
          const recent = await db
            .select()
            .from(GithubWatchDecision)
            .where(
              and(
                eq(GithubWatchDecision.projectId, project.id),
                eq(GithubWatchDecision.prNumber, pr.number),
                gte(GithubWatchDecision.createdAt, since),
              ),
            );
          if (recent.length > 0) continue;
        }

        const { decision, justification } = classifyHeuristic(pr, knownTitles);

        let requestId: number | null = null;
        if (decision === 'useful') {
          const now = new Date();
          const inserted = await db
            .insert(Request)
            .values({
              projectId: project.id,
              title: `[PR #${pr.number}] ${pr.title}`.slice(0, 200),
              content: `Issue/PR : ${pr.html_url || ''}\nAuteur : ${pr.user?.login || 'inconnu'}\n\n${pr.body || ''}`.slice(0, 4000),
              status: 'pending',
              priority: isDependabotPr(pr) ? 'low' : 'medium',
              author: pr.user?.login || 'github_watcher',
              requestType: 'Fonctionnalite',
              assigneeAgentId: 'EXPERT_GITHUB',
              createdAt: now,
              updatedAt: now,
            })
            .returning({ id: Request.id });
          requestId = inserted[0]?.id ?? null;
        }

        if (GithubWatchDecision) {
          await db.insert(GithubWatchDecision).values({
            projectId: project.id,
            prNumber: pr.number,
            prTitle: pr.title.slice(0, 500),
            prAuthor: pr.user?.login || null,
            decision,
            justification: justification.slice(0, 500),
            requestId,
            provider: 'heuristic',
            createdAt: new Date(),
          });
        }
      }
    }
    state.lastRunPrCount = totalPrs;
    state.lastRunError = null;
    await insertForgeActivityLog({
      actorType: 'system',
      actorId: 'github_watcher',
      action: 'github.watcher.run_ok',
      entityType: 'daemon',
      entityId: 'github_watcher',
      details: { prCount: totalPrs, durationMs: Date.now() - start },
    });
    return { ok: true, prCount: totalPrs };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    state.lastRunError = msg;
    await insertForgeActivityLog({
      actorType: 'system',
      actorId: 'github_watcher',
      action: 'github.watcher.run_failed',
      entityType: 'daemon',
      entityId: 'github_watcher',
      details: { error: msg, durationMs: Date.now() - start },
    });
    return { ok: false, prCount: 0, error: msg };
  } finally {
    state.lastRunDurationMs = Date.now() - start;
    state.lastRunAt = new Date();
    state.running = false;
  }
}

export async function startGithubWatcher(): Promise<void> {
  const state = getState();
  if (state.timer) return;
  const enabled = (await getConfig('githubWatcherEnabled')).toLowerCase() === 'true';
  if (!enabled) return;
  const intervalMinutes = Math.max(1, Number(await getConfig('githubWatcherIntervalMinutes')) || 10);
  state.intervalMinutes = intervalMinutes;
  // Premier run immédiat (non bloquant)
  void runGithubWatcherNow().catch(() => undefined);
  state.timer = setInterval(() => {
    void runGithubWatcherNow().catch(() => undefined);
  }, intervalMinutes * 60_000);
}

export function stopGithubWatcher(): void {
  const state = getState();
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
}

export function getGithubWatcherStatus(): GithubWatcherStatus {
  const state = getState();
  const nextRunAt = state.timer && state.lastRunAt
    ? new Date(state.lastRunAt.getTime() + state.intervalMinutes * 60_000).toISOString()
    : null;
  return {
    running: Boolean(state.timer),
    intervalMinutes: state.intervalMinutes,
    lastRunAt: state.lastRunAt ? state.lastRunAt.toISOString() : null,
    lastRunDurationMs: state.lastRunDurationMs,
    lastRunPrCount: state.lastRunPrCount,
    lastRunError: state.lastRunError,
    nextRunAt,
  };
}

/**
 * Liste paginée des dernières décisions enregistrées.
 */
export async function listRecentGithubDecisions(limit = 50): Promise<Array<Record<string, unknown>>> {
  try {
    const { db, GithubWatchDecision } = await loadAstroDb();
    if (!GithubWatchDecision) return [];
    const rows = await db
      .select()
      .from(GithubWatchDecision)
      .orderBy(desc(GithubWatchDecision.id))
      .limit(Math.max(1, Math.min(500, limit)));
    return rows as Array<Record<string, unknown>>;
  } catch {
    return [];
  }
}
