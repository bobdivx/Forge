import type { APIRoute } from 'astro';
import { exec } from 'node:child_process';
import util from 'node:util';
import fs from 'node:fs';
import { getReposRootResolved } from '../../lib/forge-repos';
import path from 'node:path';

const execPromise = util.promisify(exec);

export const GET: APIRoute = async ({ request }) => {
  try {
    const url = new URL(request.url);
    const appName = url.searchParams.get('app');
    const hash = url.searchParams.get('hash');

    if (!appName || !hash) {
      return new Response(JSON.stringify({ error: 'app and hash parameters are required' }), { status: 400 });
    }

    // Basic security validation
    if (!/^[a-zA-Z0-9_-]+$/.test(appName) || !/^[a-f0-9]+$/.test(hash)) {
      return new Response(JSON.stringify({ error: 'Invalid parameters format' }), { status: 400 });
    }

    const reposRoot = await getReposRootResolved();
    const appPath = path.join(reposRoot, appName);

    if (!fs.existsSync(appPath)) {
      return new Response(JSON.stringify({ error: 'App not found' }), { status: 404 });
    }

    const { stdout, stderr } = await execPromise(`git show --color=never ${hash}`, { cwd: appPath });

    return new Response(JSON.stringify({ diff: stdout }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Error fetching git commit diff' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
