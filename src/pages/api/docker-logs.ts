import type { APIRoute } from 'astro';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export const GET: APIRoute = async ({ url }) => {
  try {
    const isVercel = !!process.env.VERCEL || !!process.env.VERCEL_ENV;
    if (isVercel) {
      return new Response(JSON.stringify({ logs: ["Docker logs non disponibles sur Vercel"] }), { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    const containerId = url.searchParams.get('id');
    const tail = url.searchParams.get('tail') || '100';

    if (!containerId) {
      return new Response(JSON.stringify({ error: "ID du conteneur manquant" }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // 🛡️ Sentinel: Validate containerId to prevent argument injection
    if (!/^[a-zA-Z0-9_.-]+$/.test(containerId)) {
      return new Response(JSON.stringify({ error: "ID de conteneur invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const tailNum = parseInt(tail, 10);
    const validTail = isNaN(tailNum) ? '100' : String(tailNum);

    let logs = [];
    try {
        // 🛡️ Sentinel: Use execFileAsync with argument arrays instead of execSync with string concatenation
        // to prevent command injection via shell operators.
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', validTail, containerId]);
        // Docker logs may output to stdout or stderr depending on the container
        const output = stdout || stderr;
        logs = output.trim().split('\n');
    } catch (err: any) {
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\n');
        } else {
            throw err;
        }
    }

    return new Response(JSON.stringify({ logs }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    // 🛡️ Sentinel: Don't leak raw error details
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
