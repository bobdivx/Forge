import type { APIRoute } from 'astro';
import { getGlobalPermissionConfig, resetPermissionEngineCache } from '../../../lib/forge-permission-engine';
import { setConfig } from '../../../lib/config-db';
import { getHostContext } from '../../../lib/forge-host-context';

export const prerender = false;

export const GET: APIRoute = async () => {
  const cfg = await getGlobalPermissionConfig();
  const host = getHostContext();
  return new Response(
    JSON.stringify({ ...cfg, host }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const mode = String(body?.mode || '').trim();
    const allowedTools = Array.isArray(body?.allowedTools)
      ? body.allowedTools.map((v: unknown) => String(v).trim()).filter(Boolean)
      : null;
    const deniedTools = Array.isArray(body?.deniedTools)
      ? body.deniedTools.map((v: unknown) => String(v).trim()).filter(Boolean)
      : null;
    if (mode && !['autonomous', 'tiered', 'plan_first'].includes(mode)) {
      return new Response(JSON.stringify({ ok: false, error: 'mode invalide' }), { status: 400 });
    }
    const patch: Record<string, string> = {};
    if (mode) patch.permissionMode = mode;
    if (allowedTools) patch.permissionAllowedTools = JSON.stringify(allowedTools);
    if (deniedTools) patch.permissionDeniedTools = JSON.stringify(deniedTools);
    await setConfig(patch as Record<string, string>);
    resetPermissionEngineCache();
    const next = await getGlobalPermissionConfig();
    return new Response(JSON.stringify({ ok: true, ...next }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
