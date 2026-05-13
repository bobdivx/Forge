import type { APIRoute } from 'astro';
import {
  getGithubWatcherStatus,
  listRecentGithubDecisions,
  startGithubWatcher,
} from '../../../../lib/forge-github-watcher';

export const prerender = false;

export const GET: APIRoute = async () => {
  // Lance le daemon si non encore démarré (idempotent).
  void startGithubWatcher().catch(() => undefined);
  const status = getGithubWatcherStatus();
  const recent = await listRecentGithubDecisions(50);
  return new Response(JSON.stringify({ status, recent }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
