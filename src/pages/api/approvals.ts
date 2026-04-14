export const prerender = false;
import type { APIRoute } from 'astro';
import { getPendingApprovals, resolveApproval } from '../../lib/approvals-db';

export const GET: APIRoute = async () => {
  try {
    const list = await getPendingApprovals();
    return new Response(JSON.stringify({ approvals: list }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const { id, status, feedback } = await request.json();
    if (!id || !status) throw new Error('ID and Status required');
    
    await resolveApproval(Number(id), status, feedback);
    
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400 });
  }
};
