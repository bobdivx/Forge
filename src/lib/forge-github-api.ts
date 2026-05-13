/**
 * Client API GitHub minimal (fetch + Bearer token).
 *
 * Pas de dépendance Octokit pour rester léger. Le token vient de
 * `Config.githubToken` (voir `config-db.ts`).
 *
 * Tous les helpers retournent `{ ok, status, data?, error? }` pour intégration
 * directe dans le toolbus.
 */
import { getConfig } from './config-db';

export type GithubApiResult<T = unknown> = {
  ok: boolean;
  status: number;
  data?: T;
  error?: string;
};

const BASE = 'https://api.github.com';

async function githubFetch<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
): Promise<GithubApiResult<T>> {
  const token = (await getConfig('githubToken')).trim();
  if (!token) return { ok: false, status: 0, error: 'Aucun githubToken configuré (Settings → Jetons API).' };
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github+json',
        'User-Agent': 'Forge/1.0',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: T | undefined;
    if (text) {
      try {
        data = JSON.parse(text) as T;
      } catch {
        data = text as unknown as T;
      }
    }
    if (!res.ok) {
      const message =
        (data as { message?: string } | undefined)?.message ||
        `HTTP ${res.status} sur ${method} ${path}`;
      return { ok: false, status: res.status, data, error: message };
    }
    return { ok: true, status: res.status, data };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

// ───── PR helpers ────────────────────────────────────────────────────────────

export function ghListPullRequests(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') {
  return githubFetch(`/repos/${owner}/${repo}/pulls?state=${state}&per_page=100`);
}

export function ghGetPullRequest(owner: string, repo: string, number: number) {
  return githubFetch(`/repos/${owner}/${repo}/pulls/${number}`);
}

export function ghMergePullRequest(
  owner: string,
  repo: string,
  number: number,
  options?: { commit_title?: string; commit_message?: string; merge_method?: 'merge' | 'squash' | 'rebase' },
) {
  return githubFetch(`/repos/${owner}/${repo}/pulls/${number}/merge`, 'PUT', options ?? {});
}

export function ghClosePullRequest(owner: string, repo: string, number: number) {
  return githubFetch(`/repos/${owner}/${repo}/pulls/${number}`, 'PATCH', { state: 'closed' });
}

export function ghCommentOnIssueOrPr(owner: string, repo: string, number: number, body: string) {
  return githubFetch(`/repos/${owner}/${repo}/issues/${number}/comments`, 'POST', { body });
}

export function ghReviewPullRequest(
  owner: string,
  repo: string,
  number: number,
  options: { event: 'COMMENT' | 'APPROVE' | 'REQUEST_CHANGES'; body?: string },
) {
  return githubFetch(`/repos/${owner}/${repo}/pulls/${number}/reviews`, 'POST', options);
}

// ───── Issue helpers ─────────────────────────────────────────────────────────

export function ghListIssues(owner: string, repo: string, state: 'open' | 'closed' | 'all' = 'open') {
  return githubFetch(`/repos/${owner}/${repo}/issues?state=${state}&per_page=100`);
}

export function ghCreateIssue(
  owner: string,
  repo: string,
  payload: { title: string; body?: string; labels?: string[]; assignees?: string[] },
) {
  return githubFetch(`/repos/${owner}/${repo}/issues`, 'POST', payload);
}

export function ghCloseIssue(owner: string, repo: string, number: number) {
  return githubFetch(`/repos/${owner}/${repo}/issues/${number}`, 'PATCH', { state: 'closed' });
}

export function ghAddLabels(owner: string, repo: string, number: number, labels: string[]) {
  return githubFetch(`/repos/${owner}/${repo}/issues/${number}/labels`, 'POST', { labels });
}

// ───── Workflows ─────────────────────────────────────────────────────────────

export function ghListWorkflowRuns(owner: string, repo: string, options?: { status?: string; branch?: string }) {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.branch) params.set('branch', options.branch);
  const qs = params.toString();
  return githubFetch(`/repos/${owner}/${repo}/actions/runs${qs ? `?${qs}` : ''}`);
}

export function ghCancelWorkflowRun(owner: string, repo: string, runId: number) {
  return githubFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/cancel`, 'POST');
}

export function ghRerunWorkflowRun(owner: string, repo: string, runId: number) {
  return githubFetch(`/repos/${owner}/${repo}/actions/runs/${runId}/rerun`, 'POST');
}

// ───── Security ──────────────────────────────────────────────────────────────

export function ghDependabotAlerts(owner: string, repo: string, state: 'open' | 'dismissed' | 'fixed' | 'auto_dismissed' = 'open') {
  return githubFetch(`/repos/${owner}/${repo}/dependabot/alerts?state=${state}&per_page=100`);
}

export function ghCodeScanningAlerts(owner: string, repo: string, state: 'open' | 'closed' | 'dismissed' | 'fixed' = 'open') {
  return githubFetch(`/repos/${owner}/${repo}/code-scanning/alerts?state=${state}&per_page=100`);
}

// ───── Branches & releases ───────────────────────────────────────────────────

export function ghListBranches(owner: string, repo: string) {
  return githubFetch(`/repos/${owner}/${repo}/branches?per_page=100`);
}

export function ghCreateRelease(
  owner: string,
  repo: string,
  payload: { tag_name: string; name?: string; body?: string; draft?: boolean; prerelease?: boolean },
) {
  return githubFetch(`/repos/${owner}/${repo}/releases`, 'POST', payload);
}

// ───── Generic ───────────────────────────────────────────────────────────────

/**
 * Appel API GitHub générique — utilisé par le builtin `gh_api`.
 */
export function ghApiGeneric(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
  body?: unknown,
) {
  return githubFetch(endpoint, method, body);
}
