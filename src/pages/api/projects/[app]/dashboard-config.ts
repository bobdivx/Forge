import type { APIRoute } from 'astro';
import { resolveProjectPathVariants, isSafeRepoDirName } from '../../../../lib/forge-repos';
import {
  readAppDashboardConfig,
  writeAppDashboardConfig,
  readPackageScripts,
  type DashboardServerDef,
} from '../../../../lib/project-app-config';

export const GET: APIRoute = async ({ params }) => {
  const app = params.app;
  if (!isSafeRepoDirName(String(app))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const projectPath = resolveProjectPathVariants(String(app));
  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }
  const config = readAppDashboardConfig(projectPath);
  const pkg = readPackageScripts(projectPath);
  return new Response(JSON.stringify({ config, packageName: pkg.name, npmScripts: pkg.scripts }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ params, request }) => {
  const app = params.app;
  if (!isSafeRepoDirName(String(app))) {
    return new Response(JSON.stringify({ error: 'Nom invalide' }), { status: 400 });
  }
  const projectPath = resolveProjectPathVariants(String(app));
  if (!projectPath) {
    return new Response(JSON.stringify({ error: 'Projet introuvable' }), { status: 404 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'JSON invalide' }), { status: 400 });
  }

  const next = writeAppDashboardConfig(projectPath, {
    testUrl: body.testUrl as string | undefined,
    prodUrl: body.prodUrl as string | undefined,
    devLocalBaseUrl: body.devLocalBaseUrl as string | undefined,
    servers: body.servers as DashboardServerDef[] | undefined,
  });

  if (!next) {
    return new Response(JSON.stringify({ error: 'Configuration invalide ou écriture impossible' }), {
      status: 400,
    });
  }

  return new Response(JSON.stringify({ ok: true, config: next }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
