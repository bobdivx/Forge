import type { APIRoute } from 'astro';
import { execFile } from 'node:child_process';
import util from 'node:util';
import fs from 'node:fs';
import { resolveProjectPathFromDbProject } from '../../lib/forge-repos';

const execFileAsync = util.promisify(execFile);

export const POST: APIRoute = async ({ request }) => {
  try {
    const { action, appName, scriptPath, env } = await request.json();

    if (!action || !appName) {
      return new Response(JSON.stringify({ error: 'action and appName are required' }), { status: 400 });
    }

    let bin = 'npx';
    let args: string[] = [];
    let hasBuild = false;
    const execOptions: any = {};

    if (action === 'start' || action === 'start_prod') {
      if (!scriptPath) return new Response(JSON.stringify({ error: 'scriptPath required to start' }), { status: 400 });

      // Resolve the project path dynamically (handles NAS host vs Docker vs Windows root differences)
      const resolvedPath = await resolveProjectPathFromDbProject({ name: appName, path: scriptPath });
      if (!resolvedPath || !fs.existsSync(resolvedPath)) {
        return new Response(
          JSON.stringify({
            error: `Le dossier du projet n'a pas pu être trouvé. Chemin recherché : ${resolvedPath || scriptPath}`
          }),
          { status: 404 }
        );
      }

      execOptions.cwd = resolvedPath;
      if (env) {
        execOptions.env = {
          ...process.env,
          ...env
        };
      }
      
      let npmScript = action === 'start_prod' ? 'start' : 'dev';
      
      // Auto-detect the right script from package.json if default not found
      const pkgPath = resolvedPath + '/package.json';
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
          try {
              if (fs.existsSync(pkgPath)) {
                  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
                  if (pkg.scripts && pkg.scripts.build) hasBuild = true;
              }
          } catch(e) {}
      }

      args = ['-y', 'pm2', 'start', 'npm', '--name', appName, '--', 'run', npmScript];

    } else if (action === 'stop') {
      args = ['-y', 'pm2', 'stop', appName];
    } else if (action === 'delete') {
      args = ['-y', 'pm2', 'delete', appName];
    } else if (action === 'restart') {
      args = ['-y', 'pm2', 'restart', appName];
    } else {
      return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400 });
    }

    // 🛡️ Security: Use execFile to prevent command injection from user input (e.g. appName)
    let stdout = '', stderr = '';

    if (hasBuild) {
        const buildRes = await execFileAsync('npm', ['run', 'build'], execOptions);
        stdout += buildRes.stdout + '\n';
        stderr += buildRes.stderr + '\n';
    }

    const res = await execFileAsync(bin, args, execOptions);
    stdout += res.stdout;
    stderr += res.stderr;

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
    const { stdout } = await execFileAsync('npx', ['-y', 'pm2', 'jlist']);
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
