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

    // Prevent argument injection
    if (containerId.startsWith('-') || tail.startsWith('-')) {
      return new Response(JSON.stringify({ error: "Paramètres invalides" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    let logs: string[] = [];
    try {
        // Use execFile to prevent shell command injection
        const { stdout, stderr } = await execFileAsync('docker', ['logs', '--tail', tail, containerId]);
        // Docker logs may go to stdout or stderr depending on the containerized app
        const combinedOutput = stdout + stderr;
        if (combinedOutput.trim()) {
           logs = combinedOutput.trim().split('\n');
        }
    } catch (err: any) {
        if (err.stderr) {
            logs = err.stderr.toString().trim().split('\n');
        } else {
            console.error('Erreur de docker logs:', err);
            // Do not leak internal error details
            return new Response(JSON.stringify({ error: "Erreur lors de la récupération des logs" }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
        }
    }

    return new Response(JSON.stringify({ logs }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json' } 
    });
  } catch (error: any) {
    console.error('Erreur de requête logs:', error);
    // Secure error message
    return new Response(JSON.stringify({ error: "Logs indisponibles" }), {
      status: 500, 
      headers: { 'Content-Type': 'application/json' } 
    });
  }
};
