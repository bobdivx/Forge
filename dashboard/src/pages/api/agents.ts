import type { APIRoute } from 'astro';
import { execSync } from 'child_process';
import { normalizeOpenClawSessions, mapSessionToAgentRow } from '../../lib/openclaw-gateway';

export const GET: APIRoute = async () => {
  try {
    const raw = execSync('openclaw gateway call sessions.list --token casaos --json').toString();
    const data = JSON.parse(raw);
    const sessions = normalizeOpenClawSessions(data);
    const agents = sessions.map(mapSessionToAgentRow);
    
    return new Response(JSON.stringify(agents), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
