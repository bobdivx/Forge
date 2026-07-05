import type { APIRoute } from 'astro';
import { execFile } from 'child_process';
import util from 'util';

const execFileAsync = util.promisify(execFile);

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
    const tailParam = url.searchParams.get('tail') || '100';

    if (!containerId) {
      return new Response(JSON.stringify({ error: "ID du conteneur manquant" }), { 
        status: 400, 
        headers: { 'Content-Type': 'application/json' } 
      });
    }

    // Validate containerId format to prevent argument injection
    if (!/^[a-zA-Z0-9_.-]+$/.test(containerId)) {
      return new Response(JSON.stringify({ error: "Format d'ID de conteneur invalide" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate tail as integer
    const tail = parseInt(tailParam, 10);
    const validTail = isNaN(tail) ? 100 : tail;

    let logs: string[] = [];
    try {
        // Use execFileAsync to prevent command injection, passing args as an array
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', validTail.toString(), '--', containerId]);

        // docker logs often write to stderr even on success
        if (stderr && !stdout) {
          logs = stderr.trim().split('\n');
        } else if (stdout) {
          logs = stdout.trim().split('\n');
        }
    } catch (err: any) {
        // Certains logs sortent sur stderr même en cas d'erreur
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\n');
        } else {
            // Don't leak the exact internal error message
            throw new Error("Erreur d'exécution de la commande docker");
        }
    }

    return new Response(JSON.stringify({ logs }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    // Sanitize error response, avoid leaking stack traces or sensitive error messages
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
