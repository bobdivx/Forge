import type { APIRoute } from 'astro';
import { execSync } from 'child_process';
import { normalizeOpenClawSessions } from '../../lib/openclaw-gateway';

export const GET: APIRoute = async () => {
  try {
    const raw = execSync('openclaw gateway call sessions.list --token casaos --json').toString();
    const data = JSON.parse(raw);
    const sessions = normalizeOpenClawSessions(data);

    let totalCost = 0;
    let totalTokens = 0;
    let activeSessions = 0;
    let failedSessions = 0;

    sessions.forEach((s: any) => {
      totalCost += s.estimatedCostUsd || 0;
      totalTokens += s.totalTokens || 0;
      const status = String(s.status || '').toLowerCase();
      if (status === 'running' || status === 'active') activeSessions++;
      if (status === 'failed' || status === 'error') failedSessions++;
    });

    return new Response(JSON.stringify({
      totalCost,
      totalTokens,
      activeSessions,
      failedSessions,
      ok: true
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message, totalCost: 0, totalTokens: 0, activeSessions: 0, failedSessions: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
