import type { APIRoute } from 'astro';
import { runGithubWatcherNow } from '../../../../lib/forge-github-watcher';

export const prerender = false;

export const POST: APIRoute = async () => {
  const res = await runGithubWatcherNow();
  return new Response(JSON.stringify(res), {
    status: res.ok ? 200 : 500,
    headers: { 'Content-Type': 'application/json' },
  });
};
