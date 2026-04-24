import { loadAstroDb } from './load-astro-db';
import { getConfig } from './config-db';
import { getReposRootResolved, resolveProjectPathFromDbProject } from './forge-repos';
import { summarizeGithubFolder } from './project-github-meta';
import fs from 'fs';
import path from 'path';
import { eq } from 'drizzle-orm';

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
    const githubToken = await getConfig('githubToken', true);
    if (!githubToken) return;

    const { db, Project, AgentAppIssue } = await loadAstroDb();
    const projects = await db.select().from(Project);
    const reposRoot = await getReposRootResolved();

    for (const project of projects) {
console.log('Project:', project.name);
console.log('Project:', project.name);
      const projectPath = await resolveProjectPathFromDbProject(project);
      if (!projectPath || !fs.existsSync(projectPath)) { console.log('Path not found', projectPath); continue; }

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
      const runsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/actions/runs?per_page=3`, {
        headers: {
          'Authorization': `token ${githubToken}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'DevForge'
        }
      });

      if (!runsRes.ok) { console.log('not ok:', runsRes.status); continue; }
      const runsData = await runsRes.json();
      
      for (const run of runsData.workflow_runs || []) {
        if (run.status === 'completed' && run.conclusion === 'failure') {
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
                  'User-Agent': 'DevForge'
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
                      'User-Agent': 'DevForge'
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
            await db.insert(AgentAppIssue).values({
              projectId: project.id,
              url: run.html_url,
              errorType: 'ci_cd_failure',
              title: `Échec CI/CD: ${run.name} (branche ${run.head_branch})`,
              detail: `Le workflow GitHub Actions a échoué sur le commit ${run.head_sha}.\n\n${logsSnippet}`,
              status: 'open',
              reportedByAgentId: 'SYSTEM_GITHUB',
              assigneeAgentId: 'EXPERT_GITHUB', // Assigne par défaut à l'expert github ou au backend
              createdAt: new Date(),
              updatedAt: new Date()
            });
            console.log(`[github-actions] Issue créée pour l'échec CI/CD du projet ${project.name}`);
          }
        }
      }
    }
  } catch (error) {
    console.error('[github-actions] Erreur lors de la vérification:', error);
  }
}
