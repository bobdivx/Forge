import { loadAstroDb } from './load-astro-db';
import { getConfig } from './config-db';
import { getReposRootResolved, resolveProjectPathFromDbProject } from './forge-repos';
import { summarizeGithubFolder } from './project-github-meta';
import fs from 'fs';
import path from 'path';
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

export async function checkGithubActionsForProjects() {

  try {
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

    
    const projects = await db.select().from(Project);
    const reposRoot = await getReposRootResolved();

    for (const project of projects) {


      const projectPath = await resolveProjectPathFromDbProject(project);
      if (!projectPath || !fs.existsSync(projectPath)) continue;

      let meta;
      try {
        meta = summarizeGithubFolder(projectPath);
      } catch {
        continue;
      }

      if (!meta.present || !meta.remoteOriginUrl) { console.log('meta not present:', project.name); continue; }

      console.log('meta:', meta.remoteOriginUrl);
      const repoInfo = parseGithubRepo(meta.remoteOriginUrl);
      if (!repoInfo) continue;

      const { owner, repo } = repoInfo;

      // Fetch latest workflow runs
      const runsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=10`, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ZimaDev'
        }
      });

      if (!runsRes.ok) { console.log('not ok:', runsRes.status); continue; }
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
                    'User-Agent': 'ZimaDev'
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
                        'User-Agent': 'ZimaDev'
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
}

export async function checkGithubPullRequestsForProjects() {
  try {
    const { db, Config, Project, AgentAppIssue } = await loadAstroDb();
    let githubToken = '';
    try {
      const rows = await db.select().from(Config).where(eq(Config.key, 'githubToken'));
      if (rows.length) githubToken = rows[0].value;
    } catch {}
    if (!githubToken) return;

    const projects = await db.select().from(Project);

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
          'User-Agent': 'ZimaDev'
        }
      });

      if (!pullsRes.ok) continue;
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
