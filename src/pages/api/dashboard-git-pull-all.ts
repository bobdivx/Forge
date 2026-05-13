import type { APIRoute } from 'astro';
import { desc } from 'drizzle-orm';
import { loadAstroDb } from '../../lib/load-astro-db';
import { getConfig } from '../../lib/config-db';
import { repoSlugFromProject, resolveProjectPathFromDbProject } from '../../lib/forge-repos';
import { getGitSummary, isGitRepository } from '../../lib/project-git';
import {
  gitPullOrigin,
  gitStashPop,
  gitStashPushIncludingUntracked,
  isSafeGitBranchName,
} from '../../lib/project-git-actions';

const STASH_LABEL = 'Forge: sync dashboard';

export type DashboardPullResultItem = {
  slug: string;
  name: string;
  ok: boolean;
  branch?: string | null;
  skipped?: 'no_path' | 'not_git' | 'dirty' | 'invalid_branch';
  dirty?: boolean;
  phase?: 'stash' | 'pull' | 'stash_pop';
  error?: string;
  stdout?: string;
  stderr?: string;
  stashed?: boolean;
  stashPopOk?: boolean;
  stashPopDetail?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** POST : tire `origin` pour chaque projet (branche courante). Gestion des modifs locales via `dirtyStrategy`. */
export const POST: APIRoute = async ({ locals, request }) => {
  if (!locals.user?.email) {
    return json({ error: 'Non authentifié' }, 401);
  }

  const body = (await request.json().catch(() => ({}))) as {
    dirtyStrategy?: string;
  };
  const dirtyStrategy = String(body?.dirtyStrategy ?? 'skip').trim().toLowerCase();
  if (dirtyStrategy !== 'skip' && dirtyStrategy !== 'stash') {
    return json({ error: 'dirtyStrategy invalide (skip | stash)' }, 400);
  }

  const token = String((await getConfig('githubToken')) || '').trim();
  if (!token) {
    return json(
      {
        error: 'Jeton GitHub absent — renseignez-le dans Paramètres → Jetons API.',
      },
      400,
    );
  }

  let projects: Array<{ name: string; path?: string | null }> = [];
  try {
    const { db, Project } = await loadAstroDb();
    projects = await db.select().from(Project).orderBy(desc(Project.updatedAt));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return json({ error: `Base indisponible : ${msg.slice(0, 200)}` }, 503);
  }

  const results: DashboardPullResultItem[] = [];

  for (const project of projects) {
    const slug = repoSlugFromProject(project);
    const name = project.name;
    const projectPath = await resolveProjectPathFromDbProject(project);

    if (!projectPath) {
      results.push({ slug, name, ok: false, skipped: 'no_path' });
      continue;
    }
    if (!isGitRepository(projectPath)) {
      results.push({ slug, name, ok: false, skipped: 'not_git' });
      continue;
    }

    const summary = getGitSummary(projectPath);
    if (!summary.isRepo || summary.error) {
      results.push({
        slug,
        name,
        ok: false,
        error: summary.error || 'Résumé Git indisponible',
      });
      continue;
    }

    const branch = String(summary.branch || '').trim();
    if (!branch || branch === 'HEAD' || !isSafeGitBranchName(branch)) {
      results.push({
        slug,
        name,
        ok: false,
        skipped: 'invalid_branch',
        branch: summary.branch,
        error: 'Branche courante invalide ou HEAD détachée — ouvrez Git dans l’application.',
      });
      continue;
    }

    let stashed = false;

    if (summary.dirty) {
      if (dirtyStrategy === 'skip') {
        results.push({
          slug,
          name,
          ok: true,
          skipped: 'dirty',
          dirty: true,
          branch,
        });
        continue;
      }

      const stashR = await gitStashPushIncludingUntracked(projectPath, STASH_LABEL);
      if (!stashR.ok) {
        results.push({
          slug,
          name,
          ok: false,
          branch,
          phase: 'stash',
          error: stashR.stderr.slice(0, 800),
        });
        continue;
      }
      stashed = !stashR.nothingToStash;
    }

    const pullR = await gitPullOrigin(projectPath, token, branch);
    if (!pullR.ok) {
      if (stashed) {
        const restore = await gitStashPop(projectPath);
        results.push({
          slug,
          name,
          ok: false,
          branch,
          phase: 'pull',
          stashed: true,
          stderr: pullR.stderr.slice(0, 800),
          stdout: pullR.stdout.slice(0, 600),
          stashPopOk: restore.ok,
          stashPopDetail: restore.ok ? undefined : restore.stderr.slice(0, 400),
          error: `${pullR.stderr.slice(0, 400)}${!restore.ok ? ' — restauration stash en échec.' : ''}`,
        });
      } else {
        results.push({
          slug,
          name,
          ok: false,
          branch,
          phase: 'pull',
          stderr: pullR.stderr.slice(0, 800),
          stdout: pullR.stdout.slice(0, 600),
          error: pullR.stderr.slice(0, 500),
        });
      }
      continue;
    }

    let stashPopOk: boolean | undefined;
    let stashPopDetail: string | undefined;
    if (stashed) {
      const pop = await gitStashPop(projectPath);
      stashPopOk = pop.ok;
      if (!pop.ok) {
        stashPopDetail = pop.stderr.slice(0, 800);
      }
    }

    results.push({
      slug,
      name,
      ok: stashPopOk !== false,
      branch,
      stdout: pullR.stdout.slice(0, 400),
      stashed,
      stashPopOk,
      stashPopDetail,
      phase: stashPopOk === false ? 'stash_pop' : undefined,
      error:
        stashPopOk === false
          ? 'Pull OK mais réapplication du stash en conflit — résolvez dans l’éditeur ou via la page Git du projet.'
          : undefined,
    });
  }

  const pulled = results.filter((r) => r.ok && !r.skipped).length;
  const skippedDirty = results.filter((r) => r.skipped === 'dirty').length;
  const failed = results.filter((r) => !r.ok).length;

  return json({
    ok: failed === 0,
    dirtyStrategy,
    summary: { total: results.length, pulled, skippedDirty, failed },
    results,
  });
};
