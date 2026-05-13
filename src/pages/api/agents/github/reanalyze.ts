import type { APIRoute } from 'astro';
import { runGithubWatcherNow } from '../../../../lib/forge-github-watcher';

export const prerender = false;

/**
 * Force la re-analyse d'une PR : on supprime sa décision la plus récente
 * pour que le prochain cycle la reconsidère, puis on déclenche un run manuel.
 */
export const POST: APIRoute = async ({ request }) => {
  let projectId = 0;
  let prNumber = 0;
  try {
    const body = await request.json();
    projectId = Number(body?.projectId);
    prNumber = Number(body?.prNumber);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'JSON invalide' }), { status: 400 });
  }
  if (!Number.isFinite(projectId) || !Number.isFinite(prNumber)) {
    return new Response(JSON.stringify({ ok: false, error: 'projectId et prNumber requis' }), { status: 400 });
  }
  try {
    const { loadAstroDb } = await import('../../../../lib/load-astro-db');
    const { db, GithubWatchDecision } = await loadAstroDb();
    if (GithubWatchDecision) {
      const { and, eq } = await import('drizzle-orm');
      await db
        .delete(GithubWatchDecision)
        .where(
          and(
            eq(GithubWatchDecision.projectId, projectId),
            eq(GithubWatchDecision.prNumber, prNumber),
          ),
        );
    }
  } catch {
    /* ignore */
  }
  const res = await runGithubWatcherNow();
  return new Response(JSON.stringify(res), {
    status: res.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
};
