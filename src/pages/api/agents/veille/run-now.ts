import type { APIRoute } from 'astro';
import { runTechWatchNow } from '../../../../lib/forge-tech-watch';

export const prerender = false;

export const POST: APIRoute = async () => {
  const result = await runTechWatchNow();
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
};
