import type { APIRoute } from 'astro';
import {
  fetchOpenClawJson,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
  getOpenClawGatewayBaseUrl,
} from '../../lib/openclaw-gateway';

/** Lignes de log dérivées uniquement des sessions OpenClaw (données réelles). */
export const GET: APIRoute = async ({ locals }) => {
  const email = locals.user?.email;
  const base = getOpenClawGatewayBaseUrl(email);
  const result = await fetchOpenClawJson(email, '/rpc/call/sessions.list');

  const lines: string[] = [];

  if (!result.ok) {
    lines.push(`[OPENCLAW] Gateway ${base} — erreur : ${result.error || 'inconnu'}`);
    return new Response(JSON.stringify({ lines, ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const sessions = normalizeOpenClawSessions(result.data);
  lines.push(
    `[OPENCLAW] Gateway ${base} — ${sessions.length} session(s) listée(s) (limite 30).`
  );

  const rows = sessions.map(mapSessionToAgentRow);
  rows.sort((a, b) => b.lastSeenMs - a.lastSeenMs);

  for (const r of rows.slice(0, 20)) {
    const tok =
      r.contextTokens != null ? ` · ctx ${(r.contextTokens / 1024).toFixed(0)}k tok` : '';
    lines.push(
      `[${r.name}] ${r.status === 'actif' ? 'actif' : 'veille'} · modèle ${r.model}${tok} · maj ${r.lastSeen}`
    );
  }

  return new Response(JSON.stringify({ lines, ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
