import type { APIRoute } from 'astro';
import {
  deleteAgentPermission,
  getAgentPermission,
  setAgentPermission,
  type PermissionMode,
} from '../../../../lib/forge-permission-engine';

export const prerender = false;

function normalizeMode(raw: unknown): PermissionMode | null {
  const v = String(raw || '').trim().toLowerCase();
  if (v === 'autonomous' || v === 'tiered' || v === 'plan_first') return v;
  if (v === '' || v === 'inherit' || v === 'null') return null;
  return null;
}

export const GET: APIRoute = async ({ params }) => {
  const agentId = String(params.agentId || '').trim();
  if (!agentId) {
    return new Response(JSON.stringify({ ok: false, error: 'agentId requis' }), { status: 400 });
  }
  const cfg = await getAgentPermission(agentId);
  return new Response(JSON.stringify(cfg), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ params, request }) => {
  const agentId = String(params.agentId || '').trim();
  if (!agentId) {
    return new Response(JSON.stringify({ ok: false, error: 'agentId requis' }), { status: 400 });
  }
  try {
    const body = await request.json();
    const mode = normalizeMode(body?.mode);
    const allowedTools = Array.isArray(body?.allowedTools)
      ? body.allowedTools.map((v: unknown) => String(v).trim()).filter(Boolean)
      : [];
    const deniedTools = Array.isArray(body?.deniedTools)
      ? body.deniedTools.map((v: unknown) => String(v).trim()).filter(Boolean)
      : [];
    await setAgentPermission({ agentId, mode, allowedTools, deniedTools });
    const next = await getAgentPermission(agentId);
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

export const DELETE: APIRoute = async ({ params }) => {
  const agentId = String(params.agentId || '').trim();
  if (!agentId) {
    return new Response(JSON.stringify({ ok: false, error: 'agentId requis' }), { status: 400 });
  }
  await deleteAgentPermission(agentId);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
