import type { APIRoute } from 'astro';
import { getMissionBoardOverview } from '../../lib/forge-mission-board';

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const overview = await getMissionBoardOverview();
    return new Response(JSON.stringify({ ok: true, ...overview }), {
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
