import type { APIRoute } from 'astro';
import path from 'node:path';
import { db, Project, eq } from 'astro:db';
import { getConfig } from '../../../../lib/config-db';
import {
  resolveProjectPathVariants,
  isSafeRepoDirName,
  resolveProjectPathFromDbProject,
  repoSlugFromProject,
} from '../../../../lib/forge-repos';
import { getGitSummary } from '../../../../lib/project-git';
import {
  gitCheckoutBranch,
  gitCommitAll,
  gitPullOrigin,
  gitPushHeadToBranch,
  isSafeGitBranchName,
  listGitBranchesDetailed,
} from '../../../../lib/project-git-actions';

async function findProjectRowForApp(folderKey: string) {
  const projects = await db.select().from(Project);
  let row = projects.find((p) => repoSlugFromProject(p) === folderKey);
  if (row) return row;
  for (const p of projects) {
    const rpath = await resolveProjectPathFromDbProject(p);
    if (rpath && path.basename(rpath) === folderKey) return p;
  }
  return null;
}

export const GET: APIRoute = async ({ params }) => {
  const raw = params.app;
  if (!isSafeRepoDirName(String(raw))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const folderKey = String(raw);
  const projectPath = await resolveProjectPathVariants(folderKey);
  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }

  const row = await findProjectRowForApp(folderKey);
  const summary = getGitSummary(projectPath);
  const branches = await listGitBranchesDetailed(projectPath);
  let githubTokenConfigured = false;
  try {
    githubTokenConfigured = Boolean(String((await getConfig('githubToken')) || '').trim());
  } catch {
    /* ignore */
  }

  return new Response(
    JSON.stringify({
      ok: true,
      projectPath,
      projectId: row?.id ?? null,
      githubBranchDev: row?.githubBranchDev ?? 'dev',
      githubBranchProd: row?.githubBranchProd ?? 'main',
      summary,
      branches,
      githubTokenConfigured,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

export const POST: APIRoute = async ({ params, request }) => {
  const raw = params.app;
  if (!isSafeRepoDirName(String(raw))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const folderKey = String(raw);
  const projectPath = await resolveProjectPathVariants(folderKey);
  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body?.action ?? '').trim().toLowerCase();

  const row = await findProjectRowForApp(folderKey);
  if (!row) {
    return new Response(JSON.stringify({ error: 'Ligne projet introuvable en base' }), { status: 404 });
  }

  if (action === 'set_branches') {
    const dev = String(body.githubBranchDev ?? '').trim();
    const prod = String(body.githubBranchProd ?? '').trim();
    if (!isSafeGitBranchName(dev) || !isSafeGitBranchName(prod)) {
      return new Response(JSON.stringify({ error: 'Nom de branche invalide' }), { status: 400 });
    }
    await db
      .update(Project)
      .set({
        githubBranchDev: dev,
        githubBranchProd: prod,
        updatedAt: new Date(),
      })
      .where(eq(Project.id, row.id));

    return new Response(JSON.stringify({ ok: true, githubBranchDev: dev, githubBranchProd: prod }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = String((await getConfig('githubToken')) || '').trim();
  if ((action === 'pull' || action === 'push') && !token) {
    return new Response(
      JSON.stringify({
        error: 'Jeton GitHub absent — renseignez-le dans Paramètres → Jetons API.',
      }),
      { status: 400 },
    );
  }

  if (action === 'checkout') {
    const branch = String(body.branch ?? '').trim();
    if (!isSafeGitBranchName(branch)) {
      return new Response(JSON.stringify({ error: 'Branche invalide' }), { status: 400 });
    }
    const r = await gitCheckoutBranch(projectPath, branch);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: r.stderr.slice(0, 800) }), { status: 400 });
    }
    const summary = getGitSummary(projectPath);
    const branches = await listGitBranchesDetailed(projectPath);
    return new Response(JSON.stringify({ ok: true, summary, branches }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (action === 'pull') {
    const summaryBefore = getGitSummary(projectPath);
    const branch = String(body.branch ?? summaryBefore.branch ?? '').trim();
    const b = branch || 'main';
    if (!isSafeGitBranchName(b)) {
      return new Response(JSON.stringify({ error: 'Branche invalide' }), { status: 400 });
    }
    const r = await gitPullOrigin(projectPath, token, b);
    const summary = getGitSummary(projectPath);
    const branches = await listGitBranchesDetailed(projectPath);
    if (!r.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: r.stderr.slice(0, 1200),
          stdout: r.stdout.slice(0, 1200),
          summary,
          branches,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({
        ok: true,
        stdout: r.stdout.slice(0, 2000),
        summary,
        branches,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (action === 'commit') {
    const message = String(body.message ?? '').trim();
    const r = await gitCommitAll(projectPath, message);
    if (!r.ok) {
      return new Response(JSON.stringify({ error: r.stderr.slice(0, 800) }), { status: 400 });
    }
    const summary = getGitSummary(projectPath);
    return new Response(
      JSON.stringify({ ok: true, committed: r.committed, shortSha: r.shortSha, summary }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (action === 'push') {
    const target =
      String(body.targetBranch ?? '').trim() || String(row.githubBranchDev || '').trim() || 'dev';
    if (!isSafeGitBranchName(target)) {
      return new Response(JSON.stringify({ error: 'Branche cible invalide' }), { status: 400 });
    }
    const r = await gitPushHeadToBranch(projectPath, token, target);
    const summary = getGitSummary(projectPath);
    const branches = await listGitBranchesDetailed(projectPath);
    if (!r.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: r.stderr.slice(0, 1200),
          stdout: r.stdout.slice(0, 1200),
          summary,
          branches,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({
        ok: true,
        stdout: r.stdout.slice(0, 2000),
        targetBranch: target,
        summary,
        branches,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify({
      error:
        'action invalide (set_branches | checkout | pull | commit | push)',
    }),
    { status: 400 },
  );
};
