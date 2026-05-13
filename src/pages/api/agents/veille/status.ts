import type { APIRoute } from 'astro';
import {
  getTechWatchStatus,
  listRecentTechWatchSuggestions,
  startTechWatch,
} from '../../../../lib/forge-tech-watch';

export const prerender = false;

export const GET: APIRoute = async () => {
  void startTechWatch().catch(() => undefined);
  const status = getTechWatchStatus();
  const recent = await listRecentTechWatchSuggestions(100);
  return new Response(JSON.stringify({ status, recent }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
