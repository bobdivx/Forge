import type { APIRoute } from 'astro';
import {
  getBugDetectorStatus,
  listRecentAppIssues,
  startBugDetector,
} from '../../../../lib/forge-bug-detector';

export const prerender = false;

export const GET: APIRoute = async () => {
  startBugDetector();
  const status = getBugDetectorStatus();
  const recent = await listRecentAppIssues(100);
  return new Response(JSON.stringify({ status, recent }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
