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

    if (action === 'start' || action === 'start_prod') {
      if (!scriptPath) return new Response(JSON.stringify({ error: 'scriptPath required to start' }), { status: 400 });
      // Build env variables string
      let envString = '';
      if (env) {
        for (const [key, value] of Object.entries(env)) {
          envString += `${key}=${value} `;
        }
      }
      
      let npmScript = action === 'start_prod' ? 'start' : 'dev';
      
      // Auto-detect the right script from package.json if default not found
      const pkgPath = scriptPath + '/package.json';
      try {
        if (fs.existsSync(pkgPath)) {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.scripts) {
            if (action === 'start_prod') {
                if (pkg.scripts.start) npmScript = 'start';
                else if (pkg.scripts.preview) npmScript = 'preview';
                else if (pkg.scripts.serve) npmScript = 'serve';
            } else {
                if (pkg.scripts.dev) npmScript = 'dev';
                else if (pkg.scripts.start) npmScript = 'start';
                else if (pkg.scripts.preview) npmScript = 'preview';
                else if (pkg.scripts.serve) npmScript = 'serve';
            }
          }
        }
      } catch (e) {
        console.error('Error reading package.json', e);
      }
      
      // If we are starting prod and we have a build script, we might want to build first,
      // but building might take too long for a synchronous request. We'll just run the script.
      // E.g. `npm run build && pm2 start npm --name ... -- run start`
      if (action === 'start_prod') {
          // Check if build is required
          let hasBuild = false;
          try {
              if (fs.existsSync(pkgPath)) {
                  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                  if (pkg.scripts && pkg.scripts.build) hasBuild = true;
              }
          } catch(e) {}
          
          if (hasBuild) {
              command = `cd ${scriptPath} && npm run build && ${envString} pm2 start npm --name "${appName}" -- run ${npmScript}`;
          } else {
              command = `cd ${scriptPath} && ${envString} pm2 start npm --name "${appName}" -- run ${npmScript}`;
          }
      } else {
          command = `cd ${scriptPath} && ${envString} pm2 start npm --name "${appName}" -- run ${npmScript}`;
      }
  
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
    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
