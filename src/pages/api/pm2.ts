import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import util from 'node:util';
import fs from 'node:fs';

const execFilePromise = util.promisify(execFile);

export const POST: APIRoute = async ({ request }) => {
  try {
    const { action, appName, scriptPath, env } = await request.json();

    if (!action || !appName) {
      return new Response(JSON.stringify({ error: 'action and appName are required' }), { status: 400 });
    }

    // 🛡️ Sentinel: Input validation to prevent flag injection in PM2 CLI
    if (appName.startsWith('-')) {
      return new Response(JSON.stringify({ error: 'appName cannot start with a hyphen' }), { status: 400 });
    }

    if (action === 'start' || action === 'start_prod') {
      if (!scriptPath) return new Response(JSON.stringify({ error: 'scriptPath required to start' }), { status: 400 });

      // Prepare secure environment dictionary instead of string concatenation
      const childEnv = { ...process.env, ...(env || {}) };
      
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
              // 🛡️ Sentinel: Using execFile with array of args to prevent shell injection
              await execFilePromise('npm', ['run', 'build'], { cwd: scriptPath, env: childEnv });
          }
      }

      const { stdout, stderr } = await execFilePromise('npx', ['-y', 'pm2', 'start', 'npm', '--name', appName, '--', 'run', npmScript], { cwd: scriptPath, env: childEnv });
      return new Response(JSON.stringify({ status: 'ok', stdout, stderr }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let pm2Action = '';
    if (action === 'stop') pm2Action = 'stop';
    else if (action === 'delete') pm2Action = 'delete';
    else if (action === 'restart') pm2Action = 'restart';
    else return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });

    // 🛡️ Sentinel: Using execFile with array of args to prevent shell injection
    const { stdout, stderr } = await execFilePromise('npx', ['-y', 'pm2', pm2Action, appName]);

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
    const { stdout } = await execFilePromise('npx', ['-y', 'pm2', 'jlist']);
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
