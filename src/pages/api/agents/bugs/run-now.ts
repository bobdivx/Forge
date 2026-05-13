import type { APIRoute } from 'astro';
import { runBugDetectorNow } from '../../../../lib/forge-bug-detector';

export const prerender = false;

export const POST: APIRoute = async () => {
  const result = await runBugDetectorNow();
  return new Response(JSON.stringify(result), {
    status: result.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
};
