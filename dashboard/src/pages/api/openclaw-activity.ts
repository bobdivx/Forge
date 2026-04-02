import type { APIRoute } from 'astro';
import { execSync } from 'child_process';
import {
  normalizeOpenClawSessions,
  mapSessionToAgentRow,
  getOpenClawGatewayBaseUrl,
} from '../../lib/openclaw-gateway';

export const GET: APIRoute = async () => {
  try {
    const base = getOpenClawGatewayBaseUrl();
    const raw = execSync('openclaw gateway call sessions.list --token casaos --json').toString();
    const data = JSON.parse(raw);
    const sessions = normalizeOpenClawSessions(data);

    const lines: string[] = [];
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
  } catch (e: any) {
    return new Response(JSON.stringify({ lines: [`[OPENCLAW] Erreur: ${e.message}`], ok: false }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
