import { loadAstroDb } from './load-astro-db';
import { resolveProjectPathFromDbProject } from './forge-repos';
import { summarizeGithubFolder } from './project-github-meta';
import fs from 'fs';
import { eq } from 'drizzle-orm';

function isViteModuleRunnerClosedError(error: unknown): boolean {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  return /vite module runner has been closed/i.test(message);
}

function parseGithubRepo(remoteUrl: string | null): { owner: string; repo: string } | null {
  if (!remoteUrl) return null;
  // Match https://github.com/owner/repo.git or git@github.com:owner/repo.git
  const match = remoteUrl.match(/github\.com[:/](.+?)\/(.+?)(\.git)?$/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

/** Lit le corps d'une réponse d'erreur GitHub (message JSON ou extrait du texte). */
async function formatGithubApiError(res: Response): Promise<string> {
  const text = await res.text();
  try {
    const j = JSON.parse(text) as { message?: string };
    if (typeof j.message === 'string' && j.message.trim()) return j.message.trim();
  } catch {
    /* ignore */
  }
  const t = text.trim();
  if (!t) return '';
  return t.length > 200 ? `${t.slice(0, 200)}…` : t;
}

/** Fin de fenêtre de quota GitHub (ms), partagée entre actions + PRs. */
let githubApiPausedUntilMs = 0;

function rateLimitResetMsFromHeaders(res: Response): number | null {
  const raw = res.headers.get('x-ratelimit-reset');
  if (!raw) return null;
  const sec = parseInt(raw, 10);
  if (!Number.isFinite(sec)) return null;
  return sec * 1000;
}

function registerGithubRateLimitPause(res: Response): void {
  const resetMs = rateLimitResetMsFromHeaders(res);
  const until = resetMs ?? Date.now() + 60_000;
  githubApiPausedUntilMs = Math.max(githubApiPausedUntilMs, until);
}

function isGithubPrimaryRateLimit(res: Response, detail: string): boolean {
  if (/rate limit exceeded/i.test(detail)) return true;
  const rem = res.headers.get('x-ratelimit-remaining');
  return rem === '0';
}

function githubApiIsPaused(): boolean {
  return Date.now() < githubApiPausedUntilMs;
}

/**
 * Court message de log pour quota ; évite les paragraphes Terms of Service dans les logs.
 */
function shortRateLimitLogDetail(detail: string): string {
  const m = detail.match(/API rate limit exceeded[^.]*/i);
  if (m) return m[0];
  if (/rate limit/i.test(detail)) return 'API rate limit exceeded';
  return detail.length > 120 ? `${detail.slice(0, 120)}…` : detail;
}

/** Périmètre du balayage CI/PR (appelé au démarrage d’un cycle de travail, pas en boucle). */
export type GithubMonitoringScope = {
  /** Un seul dépôt (ex. pulse tableau de bord). */
  projectId?: number;
  /**
   * Sans `projectId` : ne parcourir que les projets inscrits au carnet (défaut true).
   * `false` = tous les projets en base (cas rare).
   */
  swarmOnly?: boolean;
};

type DbProject = {
  id: number;
  name: string;
  path: string;
  swarmEnabled?: number | null;
};

async function selectProjectsForMonitoring(
  db: any,
  Project: any,
  scope?: GithubMonitoringScope,
): Promise<DbProject[]> {
  if (scope?.projectId != null) {
    return db.select().from(Project).where(eq(Project.id, scope.projectId)) as Promise<DbProject[]>;
  }
  if (scope?.swarmOnly === false) {
    return db.select().from(Project) as Promise<DbProject[]>;
  }
  return db.select().from(Project).where(eq(Project.swarmEnabled, 1)) as Promise<DbProject[]>;
}

const GITHUB_PENDING_MAP_KEY = '__forgeGithubSyncInflight_v1';

function githubScopeKey(scope?: GithubMonitoringScope): string {
  if (scope?.projectId != null) return `project:${scope.projectId}`;
  if (scope?.swarmOnly === false) return 'all';
  return 'swarm';
}

function getGithubInflightMap(): Map<string, Promise<void>> {
  const g = globalThis as typeof globalThis & Record<string, Map<string, Promise<void>> | undefined>;
  if (!g[GITHUB_PENDING_MAP_KEY]) {
    g[GITHUB_PENDING_MAP_KEY] = new Map<string, Promise<void>>();
  }
  return g[GITHUB_PENDING_MAP_KEY]!;
}

/**
 * Synchronise les échecs CI et les PR ouverts vers `AgentAppIssue` avant que les agents ne reçoivent le travail.
 * À appeler au démarrage d’une session / d’un pulse projet — pas sur un timer global.
 *
 * Coalescence sur `globalThis` : la promesse est enregistrée **avant** tout await (via `queueMicrotask`),
 * sinon plusieurs appels parallèles passent tous `get`/`set` et relancent le balayage N fois.
 */
export async function syncGithubMonitorsForWorkSession(scope?: GithubMonitoringScope): Promise<void> {
  const key = githubScopeKey(scope);
  const pending = getGithubInflightMap();
  const existing = pending.get(key);
  if (existing) {
    await existing;
    return;
  }

  const inflight = new Promise<void>((resolve, reject) => {
    queueMicrotask(async () => {
      try {
        await checkGithubActionsForProjects(scope);
        await checkGithubPullRequestsForProjects(scope);
        resolve();
      } catch (e) {
        reject(e);
      } finally {
        pending.delete(key);
      }
    });
  });
  pending.set(key, inflight);
  await inflight;
}

export async function checkGithubActionsForProjects(scope?: GithubMonitoringScope) {

  try {
    if (githubApiIsPaused()) return;

    const astroDb = await loadAstroDb();
    const db = astroDb.db;
    const Config = astroDb.Config;
    const Project = astroDb.Project;
    const AgentAppIssue = astroDb.AgentAppIssue;
    let githubToken = '';
    try {
      const rows = await db.select().from(Config).where(eq(Config.key, 'githubToken'));
      if (rows.length) githubToken = rows[0].value;
    } catch {}
    if (!githubToken) { console.log('No GitHub Token in Config'); return; }

    const projects = await selectProjectsForMonitoring(db, Project, scope);
    const scopeHint =
      scope?.projectId != null ? `projet #${scope.projectId}` : 'projets carnet (swarm)';
    console.log(`[github-actions] Balayage CI — ${projects.length} dépôt(s) (${scopeHint})`);

    for (const project of projects) {


      const projectPath = await resolveProjectPathFromDbProject(project);
      if (!projectPath || !fs.existsSync(projectPath)) continue;

      let meta;
      try {
        meta = summarizeGithubFolder(projectPath);
      } catch {
        continue;
      }

      if (!meta.present || !meta.remoteOriginUrl) {
        continue;
      }

      const repoInfo = parseGithubRepo(meta.remoteOriginUrl);
      if (!repoInfo) continue;

      const { owner, repo } = repoInfo;

      // Fetch latest workflow runs
      const runsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=10`, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Ageton'
        }
      });

      if (!runsRes.ok) {
        const detail = await formatGithubApiError(runsRes);
        if (isGithubPrimaryRateLimit(runsRes, detail)) {
          registerGithubRateLimitPause(runsRes);
          const when = new Date(githubApiPausedUntilMs).toISOString();
          console.log(
            `[github-actions] ${shortRateLimitLogDetail(detail)} — arrêt du balayage ; prochaine fenêtre ~ ${when}`
          );
          break;
        }
        console.log(
          `[github-actions] actions/runs ${owner}/${repo} [${project.name}] → ${runsRes.status}${detail ? `: ${detail}` : ''}`
        );
        continue;
      }
      const runsData = await runsRes.json();
      
      
      for (const run of runsData.workflow_runs || []) {
        if (run.status === 'completed') {
          if (run.conclusion === 'failure') {
            // Check if an issue already exists for this run URL
            const existingIssues = await db.select().from(AgentAppIssue)
              .where(eq(AgentAppIssue.url, run.html_url));
              
            if (existingIssues.length === 0) {
              // Try to fetch the failed job logs
              let logsSnippet = 'Logs non disponibles.';
              try {
                const jobsRes = await fetch(run.jobs_url, {
                  headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Ageton'
                  }
                });
                if (jobsRes.ok) {
                  const jobsData = await jobsRes.json();
                  const failedJob = jobsData.jobs.find((j: any) => j.conclusion === 'failure');
                  
                  if (failedJob) {
                    // Fetch text logs for this specific job
                    const logRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/jobs/${failedJob.id}/logs`, {
                      headers: {
                        'Authorization': `token ${githubToken}`,
                        'Accept': 'application/vnd.github.v3+json',
                        'User-Agent': 'Ageton'
                      }
                    });
                    
                    if (logRes.ok) {
                      const fullLog = await logRes.text();
                      // Extract last 50 lines to keep it manageable
                      const logLines = fullLog.split('\n');
                      logsSnippet = logLines.slice(-50).join('\n');
                    }
                    
                    logsSnippet = `Job en échec: ${failedJob.name}\n\nLogs:\n${logsSnippet}`;
                  }
                }
              } catch (e) {
                 console.error('[github-actions] Erreur logs:', e);
              }

              // Create issue
              try { await db.insert(AgentAppIssue).values({
                projectId: project.id,
                url: run.html_url,
                errorType: 'ci_cd_failure',
                title: `Échec CI/CD: ${run.name} (branche ${run.head_branch})`,
                detail: `Le workflow GitHub Actions a échoué sur le commit ${run.head_sha}.\n\n${logsSnippet}`,
                status: 'open',
                reportedByAgentId: 'SYSTEM_GITHUB',
                assigneeAgentId: 'EXPERT_GITHUB',
                createdAt: new Date(),
                updatedAt: new Date()
              });
              console.log(`[github-actions] Issue créée pour l'échec CI/CD du projet ${project.name}`); } catch (e) { console.error('Failed to insert issue:', e); }
            }
          } else if (run.conclusion === 'success') {
             // If success, find any open CI/CD issues for this exact branch and close them!
             const openBranchIssues = await db.select().from(AgentAppIssue).where(eq(AgentAppIssue.projectId, project.id));
             for (const issue of openBranchIssues) {
                if (issue.status === 'open' && issue.errorType === 'ci_cd_failure' && issue.title.includes(`(branche ${run.head_branch})`)) {
                   await db.update(AgentAppIssue).set({ status: 'resolved', updatedAt: new Date() }).where(eq(AgentAppIssue.id, issue.id));
                   console.log(`[github-actions] Issue résolue automatiquement suite au succès de CI/CD: ${issue.title}`);
                }
             }
          }
        }
      }

    }
  } catch (error) {
    if (isViteModuleRunnerClosedError(error)) return;
    console.error('[github-actions] Global error:', error);
  }
}

export async function checkGithubPullRequestsForProjects(scope?: GithubMonitoringScope) {
  try {
    if (githubApiIsPaused()) return;

    const { db, Config, Project, AgentAppIssue } = await loadAstroDb();
    let githubToken = '';
    try {
      const rows = await db.select().from(Config).where(eq(Config.key, 'githubToken'));
      if (rows.length) githubToken = rows[0].value;
    } catch {}
    if (!githubToken) return;

    const projects = await selectProjectsForMonitoring(db, Project, scope);

    for (const project of projects) {
      const projectPath = await resolveProjectPathFromDbProject(project);
      if (!projectPath || !fs.existsSync(projectPath)) continue;

      let meta;
      try {
        meta = summarizeGithubFolder(projectPath);
      } catch { continue; }

      if (!meta.present || !meta.remoteOriginUrl) continue;
      const repoInfo = parseGithubRepo(meta.remoteOriginUrl);
      if (!repoInfo) continue;

      const { owner, repo } = repoInfo;

      const pullsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls?state=open`, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'Ageton'
        }
      });

      if (!pullsRes.ok) {
        const detail = await formatGithubApiError(pullsRes);
        if (isGithubPrimaryRateLimit(pullsRes, detail)) {
          registerGithubRateLimitPause(pullsRes);
          const when = new Date(githubApiPausedUntilMs).toISOString();
          console.log(
            `[github-pulls] ${shortRateLimitLogDetail(detail)} — arrêt du balayage ; prochaine fenêtre ~ ${when}`
          );
          break;
        }
        console.log(
          `[github-pulls] pulls ${owner}/${repo} [${project.name}] → ${pullsRes.status}${detail ? `: ${detail}` : ''}`
        );
        continue;
      }
      const pullsData = await pullsRes.json();

      for (const pr of pullsData) {
        const existing = await db.select().from(AgentAppIssue).where(eq(AgentAppIssue.url, pr.html_url));
        if (existing.length === 0) {
          const author = pr.user?.login || 'inconnu';
          // Type pr_review pour que l'agent sache qu'il doit reviewer
          await db.insert(AgentAppIssue).values({
            projectId: project.id,
            url: pr.html_url,
            errorType: 'pr_review',
            title: `Revue de PR #${pr.number} par ${author}`,
            detail: `Nouvelle Pull Request à examiner : "${pr.title}"\n\nDescription :\n${pr.body || 'Pas de description.'}\n\nAction attendue : Analyser les changements, vérifier la pertinence et appliquer les corrections si nécessaire.`,
            status: 'open',
            reportedByAgentId: 'SYSTEM_GITHUB',
            assigneeAgentId: 'ARCHITECTE_LOGICIEL', // L'architecte est idéal pour les PR
            createdAt: new Date(),
            updatedAt: new Date()
          });
          console.log(`[github-pulls] Issue de revue créée pour la PR #${pr.number} de ${project.name}`);
        }
      }
    }
  } catch (error) {
    if (isViteModuleRunnerClosedError(error)) throw error;
    console.error('[github-pulls] Erreur lors de la vérification des PR:', error);
  }
}
