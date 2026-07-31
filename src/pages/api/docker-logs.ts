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

    // Security check: Validate inputs to prevent argument injection
    if (!/^[a-zA-Z0-9_.-]+$/.test(containerId)) {
        return new Response(JSON.stringify({ error: "ID du conteneur invalide" }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    if (!/^(all|[0-9]+)$/.test(tail)) {
        return new Response(JSON.stringify({ error: "Paramètre tail invalide" }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        });
    }

    let logs = [];
    try {
        // Fix: Use execFile to prevent command injection
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, containerId]);
        if (stdout) {
            logs = stdout.trim().split('\n');
        } else if (stderr) {
            logs = stderr.trim().split('\n');
        }
    } catch (err: any) {
        // Certains logs sortent sur stderr, checkons stderr si stdout est vide ou si erreur
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
    // Sanitize error message to not leak server paths or details
    return new Response(JSON.stringify({ error: "Logs indisponibles." }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
