import type { APIRoute } from 'astro';
import { execSync } from 'child_process';
import {
  normalizeOpenClawSessions,
  getOpenClawGatewayBaseUrl,
} from '../../lib/openclaw-gateway';

export const GET: APIRoute = async () => {
  try {
    const base = getOpenClawGatewayBaseUrl();
    const raw = execSync('openclaw gateway call sessions.list --token casaos --json').toString();
    const data = JSON.parse(raw);
    const sessions = normalizeOpenClawSessions(data);
    
    const running = sessions.filter((s: any) => {
      const st = String(s?.status || '').toLowerCase();
      return st === 'running' || st === 'active';
    }).length;

    return new Response(
      JSON.stringify({
        reachable: true,
        gatewayUrl: base,
        sessionCount: sessions.length,
        runningCount: running,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    return new Response(
      JSON.stringify({
        reachable: false,
        gatewayUrl: 'http://127.0.0.1:18789',
        sessionCount: 0,
        runningCount: 0,
        error: e.message,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
