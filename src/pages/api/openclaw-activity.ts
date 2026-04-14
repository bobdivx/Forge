import type { APIRoute } from 'astro';
import {
  getOpenClawGatewayBaseUrl,
  fetchOpenClawSessionsPayload,
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
  getOpenClawClientDebugMeta,
} from '../../lib/openclaw-gateway';

export const GET: APIRoute = async () => {
  const [base, result, configMeta] = await Promise.all([
    getOpenClawGatewayBaseUrl(),
    fetchOpenClawSessionsPayload(undefined),
    getOpenClawClientDebugMeta(),
  ]);

  if (!result.ok) {
    return new Response(
      JSON.stringify({
        lines: [`[OPENCLAW] ${result.error || 'Erreur gateway'} (${base})`],
        ok: false,
        openclawDebug: { ...configMeta, attempts: result.attempts, resolvedVia: result.via },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const sessions = normalizeOpenClawSessions(result.data);
  const lines: string[] = [];
  lines.push(
    `[OPENCLAW] Gateway ${base} — ${sessions.length} session(s) (${result.via}).`
  );

  const rows = sessions.map((s) => mapSessionToAgentRow(s as Record<string, unknown>));
  rows.sort((a, b) => b.lastSeenMs - a.lastSeenMs);

  for (const r of rows.slice(0, 20)) {
    const tok =
      r.contextTokens != null ? ` · ctx ${(r.contextTokens / 1024).toFixed(0)}k tok` : '';
    lines.push(
      `[${r.name}] ${r.status === 'actif' ? 'actif' : 'veille'} · modèle ${r.model}${tok} · maj ${r.lastSeen}`
    );
  }

  return new Response(
    JSON.stringify({
      lines,
      ok: true,
      openclawDebug: {
        ...configMeta,
        attempts: result.attempts,
        resolvedVia: result.via,
        sessionCount: sessions.length,
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
};
