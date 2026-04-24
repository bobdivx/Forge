import type { APIRoute } from 'astro';
import { exec } from 'node:child_process';
import util from 'node:util';
import fs from 'node:fs';

const execPromise = util.promisify(exec);

export const POST: APIRoute = async ({ request }) => {
  try {
    const { action, appName, scriptPath, env } = await request.json();

    if (!action || !appName) {
      return new Response(JSON.stringify({ error: 'action and appName are required' }), { status: 400 });
    }

    let command = '';

    if (action === 'start') {
      if (!scriptPath) return new Response(JSON.stringify({ error: 'scriptPath required to start' }), { status: 400 });
      // Build env variables string
      let envString = '';
      if (env) {
        for (const [key, value] of Object.entries(env)) {
          envString += `${key}=${value} `;
        }
      }
      
      // Auto-detect the right script from package.json
      let npmScript = 'dev';
      const pkgPath = scriptPath + '/package.json';
      try {
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.scripts) {
            if (pkg.scripts.dev) npmScript = 'dev';
            else if (pkg.scripts.start) npmScript = 'start';
            else if (pkg.scripts.preview) npmScript = 'preview';
            else if (pkg.scripts.serve) npmScript = 'serve';
          }
        }
      } catch (e) {
        console.error('Error reading package.json', e);
      }
      
      command = `cd ${scriptPath} && ${envString} pm2 start npm --name "${appName}" -- run ${npmScript}`;
  
      // Alternatively, check if ecosystem.config or entry.mjs exists.
      // But let's assume `npm run dev` for dev environment for now, or build and run.
    } else if (action === 'stop') {
      command = `pm2 stop "${appName}"`;
    } else if (action === 'delete') {
      command = `pm2 delete "${appName}"`;
    } else if (action === 'restart') {
      command = `pm2 restart "${appName}"`;
    } else {
      return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
    }

    const { stdout, stderr } = await execPromise(command);

    return new Response(JSON.stringify({ status: 'ok', stdout, stderr }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Error executing PM2 command' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const GET: APIRoute = async () => {
  try {
    const { stdout } = await execPromise('pm2 jlist');
    const list = JSON.parse(stdout);
    return new Response(JSON.stringify(list), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || 'Error fetching PM2 status' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
