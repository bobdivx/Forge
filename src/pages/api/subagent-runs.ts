import type { APIRoute } from 'astro';
import {
  cancelSubagentRun,
  getSubagentRun,
  listSubagentRuns,
  type SubagentRunStatus,
} from '../../lib/forge-subagent-registry';

export const prerender = false;

function asStatus(raw: string | null): SubagentRunStatus | undefined {
  const v = String(raw || '').toLowerCase();
  if (v === 'pending' || v === 'running' || v === 'completed' || v === 'failed' || v === 'cancelled') {
    return v as SubagentRunStatus;
  }
  return undefined;
}

export const GET: APIRoute = async ({ url }) => {
  const idRaw = url.searchParams.get('id');
  if (idRaw) {
    const id = Number(idRaw);
    if (!Number.isFinite(id)) {
      return new Response(JSON.stringify({ ok: false, error: 'id invalide' }), { status: 400 });
    }
    const run = await getSubagentRun(id);
    if (!run) return new Response(JSON.stringify({ ok: false, error: 'introuvable' }), { status: 404 });
    return new Response(JSON.stringify(run), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const parentAgentId = url.searchParams.get('parent') || undefined;
  const childAgentId = url.searchParams.get('child') || undefined;
  const status = asStatus(url.searchParams.get('status'));
  const limitRaw = url.searchParams.get('limit');
  const limit = limitRaw ? Math.min(200, Math.max(1, Number(limitRaw))) : 50;
  const runs = await listSubagentRuns({ parentAgentId, childAgentId, status, limit });
  return new Response(JSON.stringify({ items: runs }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ url }) => {
  const idRaw = url.searchParams.get('id');
  const id = Number(idRaw);
  if (!Number.isFinite(id)) {
    return new Response(JSON.stringify({ ok: false, error: 'id invalide' }), { status: 400 });
  }
  const reason = url.searchParams.get('reason') || undefined;
  await cancelSubagentRun(id, reason);
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
