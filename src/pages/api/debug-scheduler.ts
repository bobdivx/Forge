import type { APIRoute } from 'astro';
import { manualStart, getWorkSystemStatus } from '../../lib/forge-work-scheduler';
import { loadAstroDb } from '../../lib/load-astro-db';

export const GET: APIRoute = async () => {
  try {
    const status = await getWorkSystemStatus();
    const { db, AgentInstruction } = await loadAstroDb();
    const agents = await db.select().from(AgentInstruction);

    return new Response(JSON.stringify({ 
        status, 
        agentsInDb: agents.length,
        time: new Date().toISOString()
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const POST: APIRoute = async () => {
    try {
        console.log('[DEBUG] Force starting work cycle...');
        await manualStart();
        return new Response(JSON.stringify({ success: true, message: 'Cycle de travail forc\u00e9' }), { status: 200 });
    } catch (e: any) {
        return new Response(JSON.stringify({ success: false, error: e.message }), { status: 500 });
    }
}
